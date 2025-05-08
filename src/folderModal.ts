import { App, Modal, Notice, FileSystemAdapter } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import MarkitdownPlugin from './main';

export class MarkitdownFolderModal extends Modal {
    plugin: MarkitdownPlugin;
    constructor(app: App, plugin: MarkitdownPlugin) {
        super(app);
        this.plugin = plugin;
    }
    onOpen() {
        const {contentEl} = this;
        contentEl.addClass('markitdown-modal');
        contentEl.createEl('h2', {text: 'Convert folder contents to markdown'});

        if (!this.plugin.markitdownInstalled) {
            contentEl.createEl('p', {
                text: 'Markitdown is not installed. Please install it in the settings tab.'
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

        contentEl.createEl('p', {text: 'Select a folder to process:'});
        const folderInputContainer = contentEl.createDiv('markitdown-file-input-container');
        const folderInput = folderInputContainer.createEl('input', {
            attr: { type: 'file', webkitdirectory: '', directory: '' }
        });

        contentEl.createEl('p', {text: 'Select file types to convert:'});
        const extensions = [
            {name: 'PDF files', ext: '.pdf'}, {name: 'Word documents', ext: '.docx'},
            {name: 'PowerPoint presentations', ext: '.pptx'}, {name: 'Excel spreadsheets', ext: '.xlsx,.xls'},
            {name: 'Web pages', ext: '.html,.htm'}, {name: 'Text files', ext: '.txt'},
            {name: 'Data files', ext: '.csv,.json,.xml'}, {name: 'Images', ext: '.jpg,.jpeg,.png,.gif'},
            {name: 'Audio files', ext: '.wav,.mp3'}, {name: 'Archives', ext: '.zip'}
        ];
        const checkboxContainer = contentEl.createDiv('markitdown-checkbox-grid');
        const selectedExtensions: string[] = [];

        extensions.forEach(ext => {
            const checkboxLabel = checkboxContainer.createEl('label', {cls: 'markitdown-checkbox-label'});
            const checkbox = checkboxLabel.createEl('input', { attr: { type: 'checkbox', value: ext.ext }});
            checkbox.addEventListener('change', () => {
                const exts = ext.ext.split(',');
                if (checkbox.checked) { exts.forEach(e => { if (!selectedExtensions.includes(e)) selectedExtensions.push(e); }); }
                else { exts.forEach(e => { const index = selectedExtensions.indexOf(e); if (index > -1) selectedExtensions.splice(index, 1); }); }
            });
            checkboxLabel.appendText(ext.name);
        });

        const buttonContainer = contentEl.createDiv('markitdown-button-container');
        const convertButton = buttonContainer.createEl('button', { text: 'Convert' });

        convertButton.addEventListener('click', async () => {
            const files = folderInput.files as FileList | null;
            if (files && files.length > 0) {
                if (selectedExtensions.length === 0) { new Notice('Please select at least one file type'); return; }
                try {
                    let vaultPath = '';
                    if (this.app.vault.adapter instanceof FileSystemAdapter) { vaultPath = this.app.vault.adapter.getBasePath(); }
                    if (!vaultPath) { new Notice('Could not determine vault path.'); return; }

                    let outputFolderSetting = this.plugin.settings.outputPath || 'markitdown-output';
                    const outputFolder = path.join(vaultPath, outputFolderSetting);
                    if (!fs.existsSync(outputFolder)) { await fs.promises.mkdir(outputFolder, { recursive: true }); }
                    
                    const filesToConvert: File[] = [];
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const ext = path.extname(file.name).toLowerCase();
                        if (selectedExtensions.includes(ext)) { filesToConvert.push(file); }
                    }

                    if (filesToConvert.length === 0) { new Notice('No matching files found in the selected folder'); return; }
                    new Notice(`Converting ${filesToConvert.length} files...`);
                    this.close();

                    let successCount = 0; let failCount = 0;
                    for (const file of filesToConvert) {
                        try {
                            const baseName = path.basename(file.name, path.extname(file.name));
                            const relativeFilePath = (file as any).webkitRelativePath || file.name;
                            const relativeDir = path.dirname(relativeFilePath);

                            const finalOutputDir = path.join(outputFolder, relativeDir);
                            if (!fs.existsSync(finalOutputDir)) { await fs.promises.mkdir(finalOutputDir, { recursive: true });}
                            
                            const outputPath = path.join(finalOutputDir, `${baseName}.md`);
                            const tempFilePath = path.join(finalOutputDir, `${Date.now()}_${path.basename(file.name)}`);
                            
                            const buffer = await file.arrayBuffer();
                            await fs.promises.writeFile(tempFilePath, Buffer.from(buffer));
                            await this.plugin.convertFile(tempFilePath, outputPath);
                            if (fs.existsSync(tempFilePath)) { await fs.promises.unlink(tempFilePath); }
                            successCount++;
                        } catch (error) {
                            console.error(`Error converting ${file.name}:`, error);
                            failCount++;
                        }
                    }
                    new Notice(`Conversion complete: ${successCount} successful, ${failCount} failed`);
                } catch (error) {
                    console.error('Error during folder conversion:', error);
                    new Notice(`Error: ${(error as Error).message}`);
                }
            } else { new Notice('Please select a folder first'); }
        });
    }
    onClose() { const {contentEl} = this; contentEl.empty(); }
} 