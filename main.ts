// This is the main entry point of the plugin. It is the first file that is loaded when Obsidian loads the plugin.
// This plugin is called Silicon AI, and it is a neural vector search engine for Obsidian.
// It indexes every block in your vault and gets a 1536-dimensional vector representation of it.
// It then allows you to search for blocks by their content, and it will return the most similar blocks.
// The search is powered by annoy.js, a fast approximate nearest neighbor search library.
// The vector representation is powered by OpenAI's embedding-ada-002 model.
// The async API calls are powered by axios.
// The plugin is written in TypeScript, and it uses the Obsidian API.

// Import the libraries
import Annoy from 'annoy.js';
// Import the types from the Obsidian API
import { App, Notice, Plugin, PluginSettingTab, Setting, View } from 'obsidian';
import { embedText } from 'src/api';

// This is the interface for the settings that the user can configure in the settings tab
interface SiliconSettings {
	apiKey: string;
};

const DEFAULT_SETTINGS: SiliconSettings = {
	apiKey: 'YOUR_API_KEY_HERE'
};


// This is the Settings tab
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

// This is the interface for the individual blocks in the index
interface IndexItem {
	path: string;
	text: string;
	embedding: number[];
}

// This is a function that flattens a tree of objects into a Record<string, IndexItem>
// It walks the tree looking for leaves with BOTH 'd' and 'v' properties
// If it finds a leaf with both properties, it adds it to the index
// with its path as the key and the text and embedding as the value
const flatten = async (obj: any, path: string = ''): Promise<Record<string, IndexItem>> => {
	let index: Record<string, IndexItem> = {};
	if (obj.d && obj.v) {
		index[obj.d] = {
			path: obj.d,
			text: '', // we will add this within the Silicon class
			embedding: obj.v
		};
	}
	for (const key in obj) {
		if (obj.hasOwnProperty(key)) {
			const child = obj[key];
			if (typeof child === 'object') {
				const childIndex = await flatten(child, path + '/' + key);

				index = {
					...index,
					...childIndex
				};
			}
		}
	}
	return index;
};


const index_loc = '/.obsidian/plugins/silicon/silicon.json';

// This is the extension logic itself
// On loading up we check for an API key, and if it's not there we show a warning.
// We check to see if there's a JSON index in the plugin folder, and if there is we load it.
// If there isn't, we index the vault and save the index.
// We also add a command to the command palette that allows the user to index the vault.
// We also add a status bar item that shows the status of the indexing process.
// We also watch the vault for changes, and if there are changes we reindex the vault.
// We also add a settings tab that allows the user to configure the plugin.
export default class Silicon extends Plugin {
	settings: SiliconSettings;
	annoy: Annoy;
	index: Record<string, IndexItem>;
	loaded: boolean;

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
		// Define Annoy constants
		const FOREST_SIZE: number = 1;
		const VECTOR_LEN: number = 1536;
		const MAX_LEAF_SIZE: number = 50;
				
		// Initialize annoy
		this.annoy = new Annoy(FOREST_SIZE, VECTOR_LEN, MAX_LEAF_SIZE);
		this.index = {};
		this.loaded = false;

		// Index on start up
		// Check if there's an index file in the plugin folder
		if (await this.app.vault.adapter.exists(index_loc)) {
			console.log('Loading index');
			
			const index_file = await this.app.vault.adapter.read(index_loc);
			this.annoy.fromJson(index_file);

			const annoy_index = await flatten(JSON.parse(index_file));
			for (const key in annoy_index) {
				if (annoy_index.hasOwnProperty(key)) {
					const item = annoy_index[key];
					const file = await this.app.vault.adapter.read(item.path);

					item.text = file;
					item.embedding = annoy_index[key].embedding;
					this.index[key] = item;
				}
			}
			this.indexVault();
			this.loaded = true;
		} else {
			console.log('Index not found');			
			this.indexVault();

		}

		// Watch the vault for changes
		this.app.vault.on('modify', (file) => {
			if (this.loaded){
				console.log('Vault modified, reindexing');
				this.indexVault();
		}
		});
	
		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'index-vault',
			name: 'Index vault',
			callback: () => {
				this.indexVault();
			}
		});

			// This adds a view to the right leaf of the workspace
		// that shows the results of searchIndex()
		this.addRibbonIcon('search', 'Search vault', async () => {
			if (this.loaded) {
				const results = await this.searchIndex();
				console.log(results)
			} else {
				new Notice('Index not loaded');
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SiliconSettingTab(this.app, this));
	}

		onunload() {
			console.log('unloading plugin');
	}

	// Various necessary functions that do not get called automatically on load
	// These are called by the plugin itself
	
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// This is the function that makes an IndexItem from a filepath, embedding combination
	async makeIndexItem(path: string, embedding: number[]): Promise<IndexItem> {
		return {
			"path": path,
			"text": await this.app.vault.adapter.read(path),
			"embedding": embedding,
		}
	}

	async indexVault() {	
		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText('Indexing vault with Silicon AI...');
		if (!this.loaded) {
			return;
		}

		this.loaded = false;
	
		const files = this.app.vault.getMarkdownFiles();
		const texts = await Promise.all(files.map((file) => this.app.vault.read(file)));
		const filesAndTexts = files.map((file, i) => {
			return {
				"path": file.path,
				"text": texts[i],
			}
		});
		
		const changedFiles = filesAndTexts.filter((f) => {
			if (this.index[f.path]) {
				if (this.index[f.path].text == f.text) {
					return false;
				}
			}
			return true;
		});
		
		console.log("indexing " + changedFiles.length + " files")
		for (const f of changedFiles) {
			if (f.text == '') {
				return;
			}

			console.log("embedding " + f.path)		
			await embedText(f.text, this.settings.apiKey).then((embedding) => {
				this.annoy.add({"d": {
					"path": f.path,
					"text": f.text,
				}, "v": embedding});
				this.index[f.path] = {
					"path": f.path,
					"text": f.text,
					"embedding": embedding,
				};
			});
			
		}

		this.loaded = true;

		// statusBarItemEl.setText('Indexed!');
		
	}

	async searchIndex() {
		if (!this.loaded) {
			console.log('Index not loaded, indexing vault')
			await this.indexVault();
		}

		const file = this.app.workspace.getActiveFile();
		if(!file) {
			console.log('No active file');
			return;
		}

		if (!this.index[file.path]) {
			console.log('File not in index, indexing vault')
			await this.indexVault();
		}

		const embedding = this.index[file.path].embedding;
		// const embedding = await embedText("what is a spells", this.settings.apiKey);
		const similar = this.annoy.get(embedding, 2);
		return similar;
		// return similarFiles;
	}

}