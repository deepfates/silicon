import { Notice, Plugin, } from 'obsidian';
import { embedText } from 'src/api';
import { SiliconView, VIEW_TYPE_SILICON } from 'src/view';
import { SiliconSettings, SiliconSettingTab, DEFAULT_SETTINGS } from './src/settings';

import * as idb from 'idb';
import { cosineSimilarity } from './src/utils';

export default class Silicon extends Plugin {
	settings: SiliconSettings;
	status: HTMLElement;
	indexLock: boolean;
	db: idb.IDBPDatabase;
	ignoreFolders: string[];

	async onload() {
		// console.log('loading plugin');
		await this.loadSettings();
		this.indexLock = false;
		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.status = this.addStatusBarItem();
		
		// Check for an API key
		if (this
			.settings
			.apiKey
			.includes
			('YOUR_API_KEY_HERE')) {
			new Notice('You need to set your OpenAI API key in the settings tab for Silicon AI to work.');
		}

		//initialize the database mapping hile hashes to file paths and embeddings
		// @ts-ignore
		const dbName = app.appId + '-silicon';
		this.db = await idb.openDB(dbName, 1, {
			upgrade(db) {
				db.createObjectStore('files');
			}
		});
		
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

		// Index on layout ready
		this.app.workspace.onLayoutReady(() => {
			this.indexVault();
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

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SiliconSettingTab(this.app, this));

		this.status.setText('⛰');
		this.status.setAttr('title', 'Silicon ready');
		
	}

		onunload() {
			// console.log('unloading plugin');
			this.db.close();
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
		const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_SILICON)[0]?.view;
					if (view instanceof SiliconView) {
						// update the view
						view.update([]);
					}
					
		this.status.setAttr('title', 'Silicon searching...');
		const results = await this.searchIndex();
				if (results) {
					// console.log(results)
					// find the SiliconView
					if (view instanceof SiliconView) {
						// update the view
						view.update(results);
					}
			}
		this.status.setText('⛰');
		this.status.setAttr('title', 'Silicon ready');
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
	// It then adds the file's path and embedding to the db
	async indexVault() {	
		// Check if the index is already being updated
		// if (this.indexLock) {
		// 	return;
		// }
		this.indexLock = true;
		// console.log('Indexing vault');
		this.status.setText('⧗');
		this.status.setAttr('title', 'Silicon indexing vault...');
		// Get all files in the vault
		const files = this.app.vault.getMarkdownFiles();
		

		// Remore viles that are in folders in the ignore list
		const filesToIndex = files.filter(file => {
			for (const folder of this.settings.ignoreFolders) {
				if (file.path.includes(folder)) {
					return false;
				}
			}
			return true;
		});
		
		if (filesToIndex.length == 0) {
			return;
		}
		// Embed each file's text with the OpenAI API
		// if the file isn't already in the db
		// or if it has changed since it was last indexed
		for (const file of filesToIndex) {

			const text = await this.app.vault.read(file);
			const key = file.path
			const value = await this.db.get('files', key);
			if (value && value.mtime == file.stat.mtime) {
				continue;
			}
			const embedding = await embedText(text, this.settings.apiKey);
			if (embedding) {
				this.status.setText('Indexing vault: ' + file.basename);
				const value = {
					mtime: file.stat.mtime,
					embedding: embedding,
				};
				await this.db.put('files', value, key);
				
			}
		}


		// Check the keys of the db to see if any files have been deleted
		// If so, remove them from the db as well
		const keys = await this.db.getAllKeys('files');
		for (const key of keys) {
			const file = this.app.vault.getAbstractFileByPath(String(key));
			if (!file) {
				await this.db.delete('files', key);
			}
		}
		
		// Unlock the index
		this.indexLock = false;
		this.status.setText('⛰');
		this.status.setAttr('title', 'Silicon ready');
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

		
		const key = file.path

		// Check if the file is in a folder to be ignored
		// If so, don't search the index
		for (const folder of this.settings.ignoreFolders) {
			if (file.path.includes(folder)) {
				// console.log('File is in an ignored folder');
				this.status.setText('File is in an ignored folder');
				return;
			}
		}

		// Check if the file is already in the index
		// And if it has changed since it was last indexed
		// If not, embed the file's text and add it to the index
		const value = await this.db.get('files', key);
		if (!value || value.mtime != file.stat.mtime) {
			this.status.setText('Embedding ' + file.basename);
			const fileText = await this.app.vault.read(file);
			const embedding = await embedText(fileText, this.settings.apiKey);
			if (embedding) {
				const value = {
					mtime: file.stat.mtime,
					embedding: embedding,
				};
				const newKey = file.path
				await this.db.put('files', value, newKey);
			}
			this.status.setText('⛰');
			this.status.setAttr('title', 'Silicon ready');
		} else {
			// It may have been searched already. Check if it has a neighbors field
			if (value.neighbors) {
				return value.neighbors;
			}
		}
		
		// Search the index for similar files
		const embedding = (await this.db.get('files', key)).embedding;
		const similarEmbeds = await this.nearestNeighbors(embedding, 53);
		const embeds = similarEmbeds.filter(embed => embed.key != file.path);
		// console.log(embeds)
		
		let results = [];
		for (const e of embeds) {
			// if undefined, skip
			if (e == undefined) {
				continue;
			}
			// if similarity is below threshold, skip
			if (e.similarity < this.settings.threshold) {
				continue;
			}
			const path = String(e.key);
			if (path) {
				results.push({path: path, similarity: e.similarity});
			}
		}
		// console.log(results)
		// filter out undefined
		results = results.filter(result => result != undefined);
		// filter out this file
		results = results.filter(result => result.path != file.path);
		// filter out files that backlink to this file
		const links = await this.app.metadataCache.resolvedLinks;
		const thisFileLinks = links[file.path];
		if (thisFileLinks) {
			// console.log(thisFileLinks)
			results = results.filter(result => !thisFileLinks[result.path]);
		}
		//@ts-ignore
		const backlinks = await this.app.metadataCache.getBacklinksForFile(file)?.data;
		if (backlinks) {
			// console.log(backlinks)
			results = results.filter(result => !backlinks[result.path]);
		}
		// console.log(results)
		// add these results to the file in db
		const fileValue = await this.db.get('files', key);
		fileValue.neighbors = results;
		await this.db.put('files', fileValue, key);
		
		return results;
 
	}

	// This function returns the k nearest neighbors of the embedding
	// It uses cosine similarity to find the nearest neighbors
	async nearestNeighbors(embedding: number[], k: number) {
		const keys = await this.db.getAllKeys('files');
		const neighbors = [];
		for (const key of keys) {
			const embed = (await this.db.get('files', key)).embedding;
			const similarity = cosineSimilarity(embedding, embed);
			neighbors.push({key: key, similarity: similarity});
		}
		neighbors.sort((a, b) => b.similarity - a.similarity);
		return neighbors.slice(0, k);
	}
}

