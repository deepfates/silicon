import { Notice, Plugin, } from 'obsidian';
import { embedText } from 'src/api';
import { KeyValueDatabase, VectorDatabase} from 'src/db'
import { SiliconView, VIEW_TYPE_SILICON } from 'src/view';
import { SiliconSettings, SiliconSettingTab, DEFAULT_SETTINGS } from './src/settings';

export default class Silicon extends Plugin {
	settings: SiliconSettings;
	status: HTMLElement;
	db: VectorDatabase;
	fileIndex: KeyValueDatabase;
	indexLock: boolean;
	neighborIndex: KeyValueDatabase;

	async onload() {
		// console.log('loading plugin');
		await this.loadSettings();
		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.status = this.addStatusBarItem();
		this.status.setText('⛰');

		// Check for an API key
		if (this
			.settings
			.apiKey
			.includes
			('YOUR_API_KEY_HERE')) {
			new Notice('You need to set your OpenAI API key in the settings tab for Silicon AI to work.');
		}

		// Initialize the index
		this.db = new VectorDatabase(simpleHash(this.app.vault.getRoot().path + 'db'));
		this.fileIndex = new KeyValueDatabase(simpleHash(this.app.vault.getRoot().path + 'FileIndex'));
		this.neighborIndex = new KeyValueDatabase(simpleHash(this.app.vault.getRoot().path + 'NeighborIndex'));
		this.indexLock = false;
		
		// Index on start up
		this.indexVault();

		// Initialize the view
		this.registerView(
			VIEW_TYPE_SILICON,
			(leaf) => new SiliconView(leaf, [], this.settings.threshold)
		);
		this.app.workspace.onLayoutReady(() => {
			this.activateView();
			this.updateView();
		});
		
		this.addCommand({
			id: 'silicon-view',
			name: 'Open Silicon',
			callback: () => {
				this.activateView();
			}
		});
		
		
		this.addRibbonIcon("mountain", "Activate view", () => {
			this.activateView();
		  });

		// Watch the vault for changes
		this.app.vault.on('modify', (file) => {
				// console.log('Vault modified, reindexing');
				this.indexVault();
		});
			

		// whenever this.workspace.getActiveFile() changes, update the view
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				this.updateView();
			})
		);
			
		// Userspace commands
		this.addCommand({
			id: 'index-vault',
			name: 'Index vault',
			callback: async () => {
				this.indexVault();
			}
		});

		this.addCommand({
			id: 'search-vault',
			name: 'Search vault',
			callback: async () => {
				this.updateView();
			}
		});

		this.addRibbonIcon('search', 'Search vault', async () => {
				this.updateView();
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SiliconSettingTab(this.app, this));
		
	}

		onunload() {
			// console.log('unloading plugin');
			this.status.setText('Silicon unloaded');
			this.status.remove();   
 			this.app.workspace.detachLeavesOfType(VIEW_TYPE_SILICON);

	}

	// Various necessary functions that do not get called automatically on load
	// These are called by the plugin itself

	// View functions
	async activateView() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_SILICON);
		
		await this.app.workspace.getRightLeaf(false).setViewState({
		  type: VIEW_TYPE_SILICON,
		  active: true,
		});
	
		this.app.workspace.revealLeaf(
		  this.app.workspace.getLeavesOfType(VIEW_TYPE_SILICON)[0]
		);
	  }

	async updateView() {
		this.status.setText('꩜');
		const results = await this.searchIndex();
				if (results) {
					// console.log(results)
					// find the SiliconView
					const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_SILICON)[0]?.view;
					if (view instanceof SiliconView) {
						// update the view
						view.update(results);
					}
			}
	}

	// Settings functions
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// This function indexes the vault
	// It embeds each file's text with the OpenAI API
	// and hashes the file's text to use as the key
	// It then adds the file's path and embedding to the index
	async indexVault() {	
		// Check if the index is already being updated
		if (this.indexLock) {
			return;
		}
		this.indexLock = true;
		// console.log('Indexing vault');
		this.status.setText('Indexing vault');
		// Get all files in the vault
		const files = this.app.vault.getMarkdownFiles();
		if (files.length == 0) {
			return;
		}

		// Embed each file's text with the OpenAI API
		// if the hash of the file's text is not already a key in the index
		for (const file of files) {
			const fileText = await this.app.vault.read(file);
			const fileHash = simpleHash(fileText);
			this.fileIndex.set(fileHash, file.path);
			
			if (await this.db.hasKey(fileHash) == false) {
				// console.log('Embedding ' + file.path)
				this.status.setText('Embedding ' + file.path);
				const embedding = await embedText(fileText, this.settings.apiKey);
				this.db.updateVector(fileHash, embedding);
				// add fileHash to fileIndex
			}
		}

		// Check the keys of the db to see if any files have been deleted
		// If so, remove them from the db as well
		const keys = await this.db.getAllKeys();
		for (const key of keys) {
			if (this.fileIndex.get(String(key)) == undefined) {
				// console.log('Removing ' + key);
				this.status.setText('Removing ' + key);
				this.db.removeVector(String(key));
			}
		}

		// Unlock the index
		this.indexLock = false;
		// console.log('Indexing complete');
		this.status.setText('⛰');
		// console.log(this)
	}

	// This function returns the file paths of the similar files
	// It takes the embedding of the active file and searches the index
	// for similar files

	async searchIndex() {
		const file = this.app.workspace.getActiveFile();
		if(!file) {
			// console.log('No active file');
			this.status.setText('No active file');
			return;
		}

		const fileText = await this.app.vault.read(file);
		const fileHash = simpleHash(fileText);

		// if the file is not in the database, embed it
		if (await this.db.hasKey(fileHash) == false) {
			// console.log('Embedding ' + file.path)
			this.status.setText('Embedding ' + file.path);
			const embedding = await embedText(fileText, this.settings.apiKey);
			this.db.updateVector(fileHash, embedding);
			this.fileIndex.set(fileHash, file.path);
		}

		const embedding = await this.db.readVector(fileHash);
		// Get the similar files
		const similarEmbeds = await this.db.search(embedding, 50);
		// store the embeds in the neighborIndex
		this.neighborIndex.set(fileHash, similarEmbeds);	
		// Remove the file itself from the similar files
		const embeds = similarEmbeds.filter(embed => embed.key != fileHash);
		// Accumulate the file paths of the similar files
		let results = [];
		for (const e of embeds) {
			// don't add if it's below the similarity threshold
			if (e.similarity < this.settings.threshold) {
				continue;
			}
			const path = await this.fileIndex.get(e.key);
			if (path) {
				results.push({path: path, similarity: e.similarity});
			}
		}

		// Filter out results that are undefined
		results = results.filter(result => result != undefined);
		return results;

	}
}

// This is a function for hashing a string to a unique id
// It is used to hash the file's text to use as the key
const simpleHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash &= hash; // Convert to 32bit integer
  }
  return new Uint32Array([hash])[0].toString(36);
};
