import { App, Notice, Plugin, PluginSettingTab, Setting, } from 'obsidian';
import { embedText } from 'src/api';
import { KeyValueDatabase, VectorDatabase} from 'src/db'
import { SiliconView, VIEW_TYPE_SILICON } from 'src/view';

// This is the settings interface that is used to store the API key
interface SiliconSettings {
	apiKey: string;
};

const DEFAULT_SETTINGS: SiliconSettings = {
	apiKey: 'YOUR_API_KEY_HERE'
};
class SiliconSettingTab extends PluginSettingTab {
	plugin: Silicon;

	constructor(app: App, plugin: Silicon) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		new Setting(containerEl)
			.setName('OpenAI API key')
			.setDesc('You can get this from https://openai.com')
			.addText(text => text
				.setPlaceholder('Enter your key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					console.log('Key: ' + value);
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));
	}
}

// This is the location of the index file
const index_loc = '/.obsidian/plugins/silicon/silicon.json';

// This is the plugin itself
export default class Silicon extends Plugin {
	settings: SiliconSettings;
	db: VectorDatabase;
	fileIndex: KeyValueDatabase;
	indexLock: boolean;

	async onload() {
		console.log('loading plugin');
		await this.loadSettings();
		// Check for an API key
		if (this
			.settings
			.apiKey
			.includes
			('YOUR_API_KEY_HERE')) {
			new Notice('You need to set your OpenAI API key in the settings tab for Silicon AI to work.');
		}

		// Initialize the index
		this.db = new VectorDatabase();
		this.fileIndex = new KeyValueDatabase();
		this.indexLock = false;
		
		// Index on start up
		this.indexVault();

		// Initialize the view
		this.registerView(
			VIEW_TYPE_SILICON,
			(leaf) => new SiliconView(leaf, [])
		);
		this.activateView();
		this.updateView();
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
				console.log('Vault modified, reindexing');
				this.indexVault();
		});
				

		// whenever this.workspace.getActiveFile() changes, update the view
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				this.updateView();
			})
		);


	
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
			console.log('unloading plugin');   
 			this.app.workspace.detachLeavesOfType(VIEW_TYPE_SILICON);

	}

	// Various necessary functions that do not get called automatically on load
	// These are called by the plugin itself
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
		const results = await this.searchIndex();
				if (results) {
					// find the SiliconView
					const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_SILICON)[0]?.view;
					if (view instanceof SiliconView) {
						// update the view
						view.update(results);
					}
			}
	}

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
				console.log('Embedding ' + file.path)
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
				console.log('Removing ' + key);
				this.db.removeVector(String(key));
			}
		}

		// Unlock the index
		this.indexLock = false;
	}

	// This function returns the file paths of the similar files
	// It takes the embedding of the active file and searches the index
	// for similar files

	async searchIndex() {
		const file = this.app.workspace.getActiveFile();
		if(!file) {
			console.log('No active file');
			return;
		}

		const fileText = await this.app.vault.read(file);
		const fileHash = simpleHash(fileText);

		// if the file is not in the database, embed it
		if (await this.db.hasKey(fileHash) == false) {
			console.log('Embedding ' + file.path)
			const embedding = await embedText(fileText, this.settings.apiKey);
			this.db.updateVector(fileHash, embedding);
			this.fileIndex.set(fileHash, file.path);
		}

		// Get the embedding of the file
		const embedding = await this.db.readVector(fileHash);
		// Get the similar files
		const similarEmbeds = await this.db.search(embedding, 10);
		let keys = similarEmbeds.map(embed => embed.key);
		// Remove the file itself from the similar files
		keys = keys.filter(key => key != fileHash);
		// Accumulate the file paths of the similar files
		let results = [];
		for (const key of keys) {
			results.push(await this.fileIndex.get(key));
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