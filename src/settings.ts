import { App, PluginSettingTab, Setting } from 'obsidian';
import Silicon from '../main';
// @ts-ignore
import { Plotly } from 'plotly';

// This is the settings interface that is used to store the API key
export interface SiliconSettings {
	apiKey: string;
	threshold: number;
}
;
export const DEFAULT_SETTINGS: SiliconSettings = {
	apiKey: 'YOUR_API_KEY_HERE',
	threshold: 0.5
};
export class SiliconSettingTab extends PluginSettingTab {
	plugin: Silicon;
	embeddings: number[][];

	constructor(app: App, plugin: Silicon) {
		super(app, plugin);
		this.plugin = plugin;
		this.embeddings = [];
	}

	display(): void {
		
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Settings for Silicon AI plugin.' });

		new Setting(containerEl)
			.setName('OpenAI API key')
			.setDesc('You can get this from https://openai.com')
			.addText(text => text
				.setPlaceholder('Enter your key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					// console.log('Key: ' + value);
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

	
		new Setting(containerEl)
			.setName('Similarity threshold')
			.setDesc('Files with similarity above this threshold will be considered similar')
			.addSlider(slider => slider
				.setLimits(0, 1, 0.01)
				.setValue(this.plugin.settings.threshold)
				.onChange(async (value) => {
					// console.log('Threshold: ' + value);
					this.plugin.settings.threshold = value;
					await this.plugin.saveSettings();
					this.display();
				}
				)
				.setDynamicTooltip()
			);
	}

}