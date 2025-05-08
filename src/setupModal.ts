import { App, Modal, Notice } from 'obsidian';
import MarkitdownPlugin from './main';

export class MarkitdownSetupModal extends Modal {
    plugin: MarkitdownPlugin;
    constructor(app: App, plugin: MarkitdownPlugin) {
        super(app);
        this.plugin = plugin;
    }
    onOpen() {
        const {contentEl} = this;
        contentEl.addClass('markitdown-modal');
        contentEl.createEl('h2', {text: 'Markitdown Setup'});

        if (!this.plugin.pythonInstalled) {
            contentEl.createEl('p', {
                text: 'Python is not installed or not found at the specified path. Please install Python and configure the path in settings.'
            });
            const buttonEl = contentEl.createEl('button', {text: 'Go to settings'});
            buttonEl.addEventListener('click', () => {
                this.close();
                if ('setting' in this.app) {
                    const appWithSetting = this.app as any;
                    appWithSetting.setting.open();
                    appWithSetting.setting.openTabById('obsidian-markitdown');
                }
            });
            return;
        }

        contentEl.createEl('p', { text: 'Markitdown is not installed. Would you like to install it now?' });
        contentEl.createEl('p', { text: 'This will install the Markitdown Python package using pip.' });
        const buttonContainer = contentEl.createDiv('markitdown-button-container');
        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.addEventListener('click', () => { this.close(); });
        const installButton = buttonContainer.createEl('button', { text: 'Install Markitdown' });

        installButton.addEventListener('click', async () => {
            installButton.disabled = true;
            installButton.setText('Installing...');
            try {
                const success = await this.plugin.installMarkitdown();
                if (success) {
                    new Notice('Markitdown installed successfully!');
                    this.close();
                    this.plugin.checkDependencies();
                } else {
                    contentEl.createEl('p', { text: 'Failed to install Markitdown. Please check the console for errors.' });
                    installButton.disabled = false;
                    installButton.setText('Try Again');
                }
            } catch (error) {
                console.error('Error installing Markitdown:', error);
                contentEl.createEl('p', { text: `Error: ${(error as Error).message}` });
                installButton.disabled = false;
                installButton.setText('Try Again');
            }
        });
    }
    onClose() { const {contentEl} = this; contentEl.empty(); }
} 