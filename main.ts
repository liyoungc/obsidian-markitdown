import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	FileSystemAdapter
	// Removed unused imports like Editor, MarkdownView, TFolder, normalizePath, requestUrl, WorkspaceLeaf
	// If you need them later for other features, you can re-add them.
} from 'obsidian';
// import { spawn } from 'child_process'; // Was unused
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import * as chokidar from 'chokidar';

// Add type for the app with setting property.
interface AppWithSetting extends App {
	setting: {
		open: () => void;
		openTabById: (id: string) => void;
	}
}

interface MarkitdownSettings {
	pythonPath: string;
	enablePlugins: boolean;
	docintelEndpoint: string;
	outputPath: string;
    externalMonitoredFolders: string[];
    externalSourceOutputFolder: string;
    monitoredFileTypes: Record<string, boolean>;
}

const DEFAULT_SETTINGS: MarkitdownSettings = {
	pythonPath: 'python',
	enablePlugins: false,
	docintelEndpoint: '',
	outputPath: '',
    externalMonitoredFolders: [],
    externalSourceOutputFolder: 'ExternalConverted',
    monitoredFileTypes: {
        ".pdf": true,
        ".docx": false,
        ".pptx": false,
        // Add more supported types here, defaulting to false if you wish
        ".xlsx": false,
        ".xls": false,
        ".html": false,
        ".htm": false,
        ".txt": false,
        ".csv": false,
        ".json": false,
        ".xml": false,
        ".jpg": false,
        ".jpeg": false,
        ".png": false,
        ".gif": false,
        ".wav": false,
        ".mp3": false,
        ".zip": false
    }
};

// =======================================================================
//  HELPER CLASS DEFINITIONS (SettingTab, Modals) - MUST BE BEFORE MarkitdownPlugin
// =======================================================================

class MarkitdownSettingTab extends PluginSettingTab {
	plugin: MarkitdownPlugin;

	constructor(app: App, plugin: MarkitdownPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Python path')
			.setDesc('Path to python executable (e.g., python, python3, or full path)')
			.addText(text => text
				.setPlaceholder('python')
				.setValue(this.plugin.settings.pythonPath)
				.onChange(async (value) => {
					this.plugin.settings.pythonPath = value;
					await this.plugin.saveSettings();
					await this.plugin.checkDependencies(); // Ensure this is awaited if checkDependencies is async
                    this.display(); // Re-render to show updated status
				}));

		new Setting(containerEl)
			.setName('Enable Markitdown plugins')
			.setDesc('Enable third-party plugins for markitdown')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enablePlugins)
				.onChange(async (value) => {
					this.plugin.settings.enablePlugins = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Azure Document Intelligence endpoint')
			.setDesc('Optional: Use Azure Document Intelligence for better conversion (requires API key setup)')
			.addText(text => text
				.setPlaceholder('https://your-resource.cognitiveservices.azure.com/')
				.setValue(this.plugin.settings.docintelEndpoint)
				.onChange(async (value) => {
					this.plugin.settings.docintelEndpoint = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Output folder (for manual conversion)')
			.setDesc('Folder path for files converted via modals/commands (relative to vault root, leave empty for default "markitdown-output")')
			.addText(text => text
				.setPlaceholder('markitdown-output')
				.setValue(this.plugin.settings.outputPath)
				.onChange(async (value) => {
					this.plugin.settings.outputPath = value.trim();
					await this.plugin.saveSettings();
				}));

        // --- UI for External Folder Monitoring ---
        containerEl.createEl('h3', { text: 'External Folder Monitoring' });

        new Setting(containerEl)
            .setName('External folders to monitor')
            .setDesc('Add or remove full paths to external folders you want to monitor.');

        (this.plugin.settings.externalMonitoredFolders || []).forEach((folderPath, index) => {
            new Setting(containerEl)
                .addText(text => text
                    .setValue(folderPath)
                    .setPlaceholder('/path/to/your/folder')
                    .onChange(async (value) => {
                        this.plugin.settings.externalMonitoredFolders[index] = value.trim();
                        await this.plugin.saveSettings();
                        this.plugin.startExternalFolderMonitoring(); // Re-initialize watcher
                    }))
                .addButton(button => button
                    .setButtonText('-')
                    .setTooltip('Remove folder')
                    .onClick(async () => {
                        this.plugin.settings.externalMonitoredFolders.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.plugin.startExternalFolderMonitoring(); // Re-initialize watcher
                        this.display(); // Refresh the settings tab UI
                    }));
        });

        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('+ Add Monitored Folder')
                .onClick(async () => {
                    if (!this.plugin.settings.externalMonitoredFolders) {
                        this.plugin.settings.externalMonitoredFolders = [];
                    }
                    this.plugin.settings.externalMonitoredFolders.push('');
                    await this.plugin.saveSettings();
                    this.display(); // Refresh settings tab to show the new empty field
                }));

        new Setting(containerEl)
			.setName('Vault output folder (for external monitoring)')
			.setDesc('Name of the folder IN YOUR VAULT where files from external monitoring will be saved (e.g., "ExternalConverted").')
			.addText(text => text
				.setPlaceholder('ExternalConverted')
				.setValue(this.plugin.settings.externalSourceOutputFolder)
				.onChange(async (value) => {
					this.plugin.settings.externalSourceOutputFolder = value.trim();
					await this.plugin.saveSettings();
					console.log('External source output folder set to:', this.plugin.settings.externalSourceOutputFolder);
				}));

        new Setting(containerEl)
            .setName('Monitored file types (for external folders)')
            .setDesc('Select which file types to process from the monitored external folders.');

        // Ensure monitoredFileTypes exists in settings
        if (!this.plugin.settings.monitoredFileTypes) {
            this.plugin.settings.monitoredFileTypes = { ...DEFAULT_SETTINGS.monitoredFileTypes };
        }

        Object.keys(DEFAULT_SETTINGS.monitoredFileTypes).forEach(ext => { // Iterate over default keys to ensure all options are shown
            new Setting(containerEl)
                .setName(ext.toUpperCase().substring(1)) // e.g., PDF, DOCX
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.monitoredFileTypes[ext] === true)
                    .onChange(async (value) => {
                        this.plugin.settings.monitoredFileTypes[ext] = value;
                        await this.plugin.saveSettings();
                    }));
        });


		// Status section
		new Setting(containerEl)
			.setName('Status')
			.setHeading();

		const statusContainer = containerEl.createDiv('markitdown-status-container');

		// Python status
		const pythonStatus = statusContainer.createDiv('markitdown-status-item');

		const pythonIcon = pythonStatus.createSpan();
		pythonIcon.addClass('markitdown-status-icon');
		pythonIcon.addClass(this.plugin.pythonInstalled ? 'success' : 'error');
		pythonIcon.setText(this.plugin.pythonInstalled ? '✓' : '✗');

		pythonStatus.createSpan().setText(`Python: ${this.plugin.pythonInstalled ? 'Installed' : 'Not installed'}`);

		// Markitdown status
		const markitdownStatus = statusContainer.createDiv('markitdown-status-item');

		const markitdownIcon = markitdownStatus.createSpan();
		markitdownIcon.addClass('markitdown-status-icon');
		markitdownIcon.addClass(this.plugin.markitdownInstalled ? 'success' : 'error');
		markitdownIcon.setText(this.plugin.markitdownInstalled ? '✓' : '✗');

		markitdownStatus.createSpan().setText(`Markitdown: ${this.plugin.markitdownInstalled ? 'Installed' : 'Not installed'}`);

		// Install button if Markitdown is not installed
		if (!this.plugin.markitdownInstalled && this.plugin.pythonInstalled) {
			const installButton = containerEl.createEl('button', {
				text: 'Install Markitdown',
				cls: 'markitdown-install-button'
			});

			installButton.addEventListener('click', async () => {
				installButton.disabled = true;
				installButton.setText('Installing...');

				try {
					const success = await this.plugin.installMarkitdown();

					if (success) {
						new Notice('Markitdown installed successfully!');
						this.display(); // Refresh the settings panel
					} else {
						new Notice('Failed to install Markitdown. Please check the console for errors.');
						installButton.disabled = false;
						installButton.setText('Try Again');
					}
				} catch (error) {
					console.error('Error installing Markitdown:', error);
					new Notice(`Error: ${(error as Error).message}`);
					installButton.disabled = false;
					installButton.setText('Try Again');
				}
			});
		}
	}
} // END OF MarkitdownSettingTab

class MarkitdownFileModal extends Modal {
	plugin: MarkitdownPlugin;

	constructor(app: App, plugin: MarkitdownPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.addClass('markitdown-modal');
		contentEl.createEl('h2', {text: 'Convert file to markdown'});

		if (!this.plugin.markitdownInstalled) {
			contentEl.createEl('p', {
				text: 'Markitdown is not installed. Please install it in the settings tab.'
			});

			const buttonEl = contentEl.createEl('button', {
				text: 'Go to settings'
			});

			buttonEl.addEventListener('click', () => {
				this.close();
				if ('setting' in this.app) {
					const appWithSetting = this.app as AppWithSetting;
					appWithSetting.setting.open();
					appWithSetting.setting.openTabById('obsidian-markitdown');
				}
			});
			return;
		}

		contentEl.createEl('p', {text: 'Select a file to convert:'});
		const fileInputContainer = contentEl.createDiv('markitdown-file-input-container');
		const fileInput = fileInputContainer.createEl('input', {
			attr: {
				type: 'file',
				accept: '.pdf,.docx,.pptx,.xlsx,.xls,.html,.htm,.txt,.csv,.json,.xml,.jpg,.jpeg,.png,.gif,.wav,.mp3,.zip'
			}
		});
		const buttonContainer = contentEl.createDiv('markitdown-button-container');
		const convertButton = buttonContainer.createEl('button', {
			text: 'Convert'
		});

		convertButton.addEventListener('click', async () => {
			if (fileInput.files && fileInput.files.length > 0) {
				const file = fileInput.files[0];
				try {
					let vaultPath = '';
					if (this.app.vault.adapter instanceof FileSystemAdapter) {
						vaultPath = this.app.vault.adapter.getBasePath();
					}
					if (!vaultPath) {
						new Notice('Could not determine vault path. This plugin requires a local vault.');
						return;
					}
					let outputFolder = this.plugin.settings.outputPath || '';
					if (!outputFolder) {
						outputFolder = path.join(vaultPath, 'markitdown-output');
						if (!fs.existsSync(outputFolder)) {
							fs.mkdirSync(outputFolder, { recursive: true });
						}
					} else {
						outputFolder = path.join(vaultPath, outputFolder); // Ensure it's an absolute path if relative
						if (!path.isAbsolute(outputFolder) && vaultPath) { // Double check, though join should handle it
							outputFolder = path.join(vaultPath, this.plugin.settings.outputPath);
						}
						if (!fs.existsSync(outputFolder)) {
							fs.mkdirSync(outputFolder, { recursive: true });
						}
					}
					const baseName = path.basename(file.name, path.extname(file.name));
					const outputPath = path.join(outputFolder, `${baseName}.md`);
					new Notice('Converting file...');
					const tempFilePath = path.join(outputFolder, `${Date.now()}_${file.name}`); // temp in output
					const buffer = await file.arrayBuffer();
					await fs.promises.writeFile(tempFilePath, Buffer.from(buffer)); // Use async writeFile

					await this.plugin.convertFile(tempFilePath, outputPath);

					if (fs.existsSync(tempFilePath)) { // Check before unlinking
						await fs.promises.unlink(tempFilePath); // Use async unlink
					}
					// await this.app.vault.adapter.exists(outputPath); // exists is not guaranteed to refresh cache for opening
					new Notice(`File converted and saved to ${outputPath}`);
					this.close();

					const relativeOutputFilePath = path.relative(vaultPath, outputPath).replace(/\\/g, '/');
                    const newFile = this.app.vault.getAbstractFileByPath(relativeOutputFilePath);
                    if (newFile instanceof TFile) {
                        this.app.workspace.getLeaf(true).openFile(newFile);
                    } else {
                        // Fallback if getAbstractFileByPath is slow or doesn't find it immediately
                        new Notice(`Converted file at: ${relativeOutputFilePath}. Please open manually if not shown.`);
                    }
				} catch (error) {
					console.error('Error during conversion:', error);
					new Notice(`Error: ${(error as Error).message}`);
				}
			} else {
				new Notice('Please select a file first');
			}
		});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
} // END OF MarkitdownFileModal

class MarkitdownFolderModal extends Modal {
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
			// ... (same setup as FileModal for when not installed)
			contentEl.createEl('p', {
				text: 'Markitdown is not installed. Please install it in the settings tab.'
			});
			const buttonEl = contentEl.createEl('button', {text: 'Go to settings'});
			buttonEl.addEventListener('click', () => {
				this.close();
				if ('setting' in this.app) {
					(this.app as AppWithSetting).setting.open();
					(this.app as AppWithSetting).setting.openTabById('obsidian-markitdown');
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
			// @ts-ignore
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
							// @ts-ignore temp path for relative path from folder input
							const relativeFilePath = file.webkitRelativePath || file.name; 
							const relativeDir = path.dirname(relativeFilePath);

							const finalOutputDir = path.join(outputFolder, relativeDir);
							if (!fs.existsSync(finalOutputDir)) { await fs.promises.mkdir(finalOutputDir, { recursive: true });}
							
							const outputPath = path.join(finalOutputDir, `${baseName}.md`);
							const tempFilePath = path.join(finalOutputDir, `${Date.now()}_${path.basename(file.name)}`); // temp in correct subfolder
							
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
} // END OF MarkitdownFolderModal

class MarkitdownSetupModal extends Modal {
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
			// ... (same setup as FileModal)
			contentEl.createEl('p', {
				text: 'Python is not installed or not found at the specified path. Please install Python and configure the path in settings.'
			});
			const buttonEl = contentEl.createEl('button', {text: 'Go to settings'});
			buttonEl.addEventListener('click', () => {
				this.close();
				if ('setting' in this.app) {
					(this.app as AppWithSetting).setting.open();
					(this.app as AppWithSetting).setting.openTabById('obsidian-markitdown');
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
                    this.plugin.checkDependencies(); // Re-check to update status
                    // Consider refreshing settings tab if it's open
				} else {
					contentEl.createEl('p', { text: 'Failed to install Markitdown. Please check the console for errors.' });
					installButton.disabled = false; installButton.setText('Try Again');
				}
			} catch (error) {
				console.error('Error installing Markitdown:', error);
				contentEl.createEl('p', { text: `Error: ${(error as Error).message}` });
				installButton.disabled = false; installButton.setText('Try Again');
			}
		});
	}
	onClose() { const {contentEl} = this; contentEl.empty(); }
} // END OF MarkitdownSetupModal


// =======================================================================
//  MAIN PLUGIN CLASS DEFINITION
// =======================================================================
export default class MarkitdownPlugin extends Plugin {
	settings: MarkitdownSettings;
	pythonInstalled = false;
	markitdownInstalled = false;
	private externalFolderWatcher: chokidar.FSWatcher | null = null;

	async onload() {
		await this.loadSettings();
		await this.checkDependencies();

		this.addRibbonIcon(
			'file-text',
			'Convert to Markdown with Markitdown',
			() => {
				new MarkitdownFileModal(this.app, this).open();
			}
		);

		this.addCommand({
			id: 'convert-file-markitdown',
			name: 'Convert file to Markdown with Markitdown',
			callback: () => {
				if (!this.markitdownInstalled) {
					new MarkitdownSetupModal(this.app, this).open();
					return;
				}
				new MarkitdownFileModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'convert-folder-markitdown',
			name: 'Convert folder contents to Markdown with Markitdown',
			callback: () => {
				if (!this.markitdownInstalled) {
					new MarkitdownSetupModal(this.app, this).open();
					return;
				}
				new MarkitdownFolderModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'markitdown-rescan-external-folders',
			name: 'Rescan external monitored folders now',
			callback: () => {
				this.scanMonitoredFoldersOnce();
			}
		});

		this.addSettingTab(new MarkitdownSettingTab(this.app, this));

		console.log('External Monitored Folders from settings:', this.settings.externalMonitoredFolders);
        console.log('External Source Output Folder from settings:', this.settings.externalSourceOutputFolder);

        this.startExternalFolderMonitoring();
	}

	async checkDependencies() {
		try {
			await this.execCommand(`${this.settings.pythonPath} --version`);
			this.pythonInstalled = true;
			try {
				await this.execCommand(`${this.settings.pythonPath} -m pip show markitdown`);
				this.markitdownInstalled = true;
			} catch (error) {
				this.markitdownInstalled = false;
			}
		} catch (error) {
			this.pythonInstalled = false;
			this.markitdownInstalled = false;
			console.error("Failed to check Python installation", error);
		}
	}

	async execCommand(command: string): Promise<string> {
		return new Promise((resolve, reject) => {
			exec(command, (error, stdout, stderr) => {
				if (error) { reject(error); return; }
				resolve(stdout);
			});
		});
	}

	async installMarkitdown(): Promise<boolean> {
		try {
			await this.execCommand(`${this.settings.pythonPath} -m pip install 'markitdown[all]'`);
			this.markitdownInstalled = true;
			return true;
		} catch (error) {
			console.error("Failed to install Markitdown", error);
			return false;
		}
	}
	// Inside your MarkitdownPlugin class in main.ts

	async scanMonitoredFoldersOnce(): Promise<void> {
		const foldersToScan = this.settings.externalMonitoredFolders;
		const { externalSourceOutputFolder, monitoredFileTypes } = this.settings;

		if (!foldersToScan || foldersToScan.length === 0) {
			new Notice("Markitdown: No external folders configured to scan.");
			console.log("Markitdown: No external folders configured to scan.");
			return;
		}

		if (!externalSourceOutputFolder || externalSourceOutputFolder.trim() === "") {
			new Notice("Markitdown: Vault output folder for external sources is not configured.");
			return;
		}

		const validPathsToScan = foldersToScan.filter(p => p && p.trim() !== "" && fs.existsSync(p));
		if (validPathsToScan.length === 0) {
			new Notice("Markitdown: No valid external folders found to scan.");
			console.log("Markitdown: No valid external folders found to scan.");
			return;
		}

		new Notice(`Markitdown: Starting scan of ${validPathsToScan.length} folder(s)...`);
		console.log("Markitdown: Scanning folders:", validPathsToScan);

		let filesProcessed = 0;

		// Create a temporary watcher for each path to scan it
		// Chokidar's 'ready' event fires after the initial add events are done for existing files
		// when ignoreInitial is false.
		for (const folderPath of validPathsToScan) {
			console.log(`Scanning folder: ${folderPath}`);
			const watcher = chokidar.watch(folderPath, {
				persistent: false,      // Don't keep watching after scan
				ignoreInitial: false,   // <<< KEY: Process existing files
				depth: Infinity,        // Scan recursively
				ignored: /(^|[\/\\])\../, // ignore dotfiles
			});

			// A promise to know when this specific watcher is done with its initial scan
			const scanPromise = new Promise<void>((resolveScan) => {
				watcher
					.on('add', async (filePath: string) => {
						console.log(`Scan found file: ${filePath}`);
						// Use your existing handler; it checks file types
						await this.handleExternalFileEvent(filePath, folderPath, 'add');
						filesProcessed++;
					})
					.on('addDir', (dirPath: string) => {
						// You might want to log directories found during scan, but typically don't "process" them
						console.log(`Scan found directory: ${dirPath}`);
					})
					.on('error', (error: Error) => {
						console.error(`Error scanning ${folderPath}:`, error);
						new Notice(`Markitdown: Error during scan of ${folderPath}.`);
					})
					.on('ready', () => {
						console.log(`Initial scan of ${folderPath} complete.`);
						watcher.close(); // Close this specific watcher
						resolveScan();
					});
			});
			await scanPromise; // Wait for this folder's scan to complete before starting the next (optional)
		}

		new Notice(`Markitdown: Scan complete. Processed approximately ${filesProcessed} files.`);
		console.log(`Markitdown: Scan complete. Processed approximately ${filesProcessed} files.`);
	}
	async convertFile(filePath: string, outputPath: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const command = `markitdown "${filePath}" > "${outputPath}"`;
			exec(command, (error, stdout, stderr) => {
				if (error) {
					const moduleCommand = `${this.settings.pythonPath} -c "from markitdown import convert; convert('${filePath}', output_file='${outputPath}')"`;
					exec(moduleCommand, (moduleError, moduleStdout, moduleStderr) => {
						if (moduleError) {
							const basicCommand = `${this.settings.pythonPath} -m markitdown "${filePath}" > "${outputPath}"`;
							exec(basicCommand, (basicError, basicStdout, basicStderr) => {
								if (basicError) {
									reject(new Error(`Markitdown failed to convert the file: ${basicError.message}\n${basicStderr}`));
									return;
								}
								resolve(basicStdout);
							});
							return;
						}
						resolve(moduleStdout);
					});
					return;
				}
				resolve(stdout);
			});
		});
	}

	startExternalFolderMonitoring() {
		if (this.externalFolderWatcher) {
			console.log("Stopping existing external folder watcher(s).");
			this.externalFolderWatcher.close();
			this.externalFolderWatcher = null;
		}

		const foldersToWatch = this.settings.externalMonitoredFolders;

		if (foldersToWatch && foldersToWatch.length > 0) {
			const validPathsToWatch = foldersToWatch.filter(p => p && p.trim() !== "" && fs.existsSync(p));
			if (validPathsToWatch.length > 0) {
				if (this.externalFolderWatcher) {
					this.externalFolderWatcher.close();
					this.externalFolderWatcher = null;
				}
				console.log("Starting chokidar for paths:", validPathsToWatch);
				this.externalFolderWatcher = chokidar.watch(validPathsToWatch, {
					ignored: /(^|[\/\\])\../,
					persistent: true,
					ignoreInitial: true,
					depth: Infinity
				});

				this.externalFolderWatcher
					.on('add', (filePath: string, stats) => {
						const basePath = validPathsToWatch.find(p => filePath.startsWith(p + path.sep) || filePath.startsWith(p + '/'));
						if (basePath) {
							console.log(`Chokidar 'add' event for: ${filePath} (within base: ${basePath})`);
							this.handleExternalFileEvent(filePath, basePath, 'add');
						} else {
							console.warn(`Could not determine base path for added file: ${filePath}`);
						}
					})
					.on('change', (filePath: string, stats) => {
						const basePath = validPathsToWatch.find(p => filePath.startsWith(p + path.sep) || filePath.startsWith(p + '/'));
						if (basePath) {
							console.log(`Chokidar 'change' event for: ${filePath} (within base: ${basePath})`);
							this.handleExternalFileEvent(filePath, basePath, 'change');
						} else {
							console.warn(`Could not determine base path for changed file: ${filePath}`);
						}
					})
					.on('unlink', (filePath: string) => {
						const basePath = validPathsToWatch.find(p => filePath.startsWith(p + path.sep) || filePath.startsWith(p + '/'));
						if (basePath) {
							console.log(`Chokidar 'unlink' event for: ${filePath} (within base: ${basePath})`);
							this.handleExternalFileEvent(filePath, basePath, 'unlink');
						} else {
							console.warn(`Could not determine base path for unlinked file: ${filePath}`);
						}
					})
					.on('error', (error: Error) => {
                        console.error(`Watcher error for one of the paths in [${validPathsToWatch.join(', ')}]:`, error);
                        new Notice(`Markitdown: Error watching folder. See console.`);
                        // Decide if you want to stop all watching or just for a specific path.
                        // For now, it continues watching other paths if one errors out.
                    })
					.on('ready', () => { console.log(`Initial scan complete. Ready for changes in configured folders: ${validPathsToWatch.join(', ')}`); });

				new Notice(`Markitdown: Started monitoring ${validPathsToWatch.length} folder(s).`);
			} else {
				 console.log("Markitdown: No valid external folders configured for monitoring.");
				 if (this.externalFolderWatcher) { this.externalFolderWatcher.close(); this.externalFolderWatcher = null;}
			}
		} else {
			console.log("Markitdown: No external folders configured.");
			if (this.externalFolderWatcher) { this.externalFolderWatcher.close(); this.externalFolderWatcher = null;}
		}
	}

	async handleExternalFileEvent(
		sourceFilePath: string,
		monitoredFolderBasePath: string,
		eventType: 'add' | 'change' | 'unlink'
	): Promise<void> {
		console.log(`Handling event '${eventType}' for source file: ${sourceFilePath} (base: ${monitoredFolderBasePath})`);

		const sourceFileExtension = path.extname(sourceFilePath).toLowerCase();

		if (!this.settings.monitoredFileTypes || this.settings.monitoredFileTypes[sourceFileExtension] !== true) {
			console.log(`Skipping file: ${sourceFilePath} (type ${sourceFileExtension} not enabled for monitoring).`);
			return;
		}

		const vaultOutputFolderName = this.settings.externalSourceOutputFolder;
		if (!vaultOutputFolderName || vaultOutputFolderName.trim() === "") {
			console.warn("Vault output folder for external sources is not configured.");
			new Notice("Markitdown: Please configure the 'External source output folder' in settings.");
			return;
		}

		let vaultBasePath = "";
		if (this.app.vault.adapter instanceof FileSystemAdapter) {
			vaultBasePath = this.app.vault.adapter.getBasePath();
		}
		if (!vaultBasePath) {
			console.error("Could not determine vault base path.");
			new Notice("Markitdown: Could not determine vault path.");
			return;
		}

		const relativePathFromMonitoredBase = path.relative(monitoredFolderBasePath, sourceFilePath);
		const relativeDir = path.dirname(relativePathFromMonitoredBase);
		const fullVaultOutputSubdirectory = path.join(vaultBasePath, vaultOutputFolderName, relativeDir);

		const sourceFileNameWithoutExt = path.basename(sourceFilePath, sourceFileExtension);
		const markdownFileName = `${sourceFileNameWithoutExt}.md`;
		const markdownFullOutputPath = path.join(fullVaultOutputSubdirectory, markdownFileName);

		const archiveFolderParent = path.join(vaultBasePath, vaultOutputFolderName, ".archive");
		const archiveFileSuffix = eventType === 'unlink' ? 'deleted' : (eventType === 'change' ? 'changed' : 'unknown'); // Suffix for archive
		const archiveFileSubPath = path.join(relativeDir, `${sourceFileNameWithoutExt}_${Date.now()}_${archiveFileSuffix}.md`);
		const fullArchiveFilePath = path.join(archiveFolderParent, archiveFileSubPath);

		if (eventType === 'unlink') {
			try {
				await fs.promises.access(markdownFullOutputPath, fs.constants.F_OK);
				console.log(`Source file ${sourceFilePath} deleted. Archiving Markdown: ${markdownFullOutputPath}`);
				await fs.promises.mkdir(path.dirname(fullArchiveFilePath), { recursive: true });
				await fs.promises.rename(markdownFullOutputPath, fullArchiveFilePath);
				console.log(`Archived (moved) ${markdownFullOutputPath} to ${fullArchiveFilePath} due to source deletion.`);
				new Notice(`Markitdown: Archived ${markdownFileName} (source deleted).`);
			} catch (error) {
				console.log(`No existing Markdown file found at '${markdownFullOutputPath}' to archive for 'unlink' event, or other error:`, (error as Error).code);
			}
			return;
		}

		if (eventType === 'change') {
			console.log(`[DEBUG][ARCHIVE_CHECK] Checking for file to archive at: '${markdownFullOutputPath}'`);
			try {
				await fs.promises.access(markdownFullOutputPath, fs.constants.F_OK);
				console.log(`Source file ${sourceFilePath} changed. Archiving existing Markdown: ${markdownFullOutputPath}`);
				await fs.promises.mkdir(path.dirname(fullArchiveFilePath), { recursive: true });
				await fs.promises.copyFile(markdownFullOutputPath, fullArchiveFilePath);
				console.log(`Archived (copied) existing ${markdownFullOutputPath} to ${fullArchiveFilePath}`);
				new Notice(`Markitdown: Archived previous version of ${markdownFileName}`);
			} catch (error) {
				console.log(`No existing Markdown file found at '${markdownFullOutputPath}' to archive for 'change' event, or other access error:`, (error as Error).code);
			}
		}

		try {
			console.log(`Ensuring vault output subdirectory exists: ${fullVaultOutputSubdirectory}`);
			await fs.promises.mkdir(fullVaultOutputSubdirectory, { recursive: true });
		} catch (error) {
			console.error(`Error creating vault output subdirectory ${fullVaultOutputSubdirectory}:`, error);
			new Notice(`Markitdown: Error creating output subdirectory in vault.`);
			return;
		}

		console.log(`Target Markdown output path: ${markdownFullOutputPath}`);

		if (eventType === 'add' || eventType === 'change') {
			try {
				const eventTypeLabel = eventType === 'add' ? 'Newly added' : 'Changed';
				const placeholderContent = `# Converted: ${sourceFileNameWithoutExt}\n\n(${eventTypeLabel} Source)\nSource Path: ${sourceFilePath}\nRelative Path: ${relativePathFromMonitoredBase}\nProcessed on: ${new Date().toLocaleString()}`;
				await fs.promises.writeFile(markdownFullOutputPath, placeholderContent);

				if (eventType === 'add') {
					console.log(`Successfully created placeholder Markdown file: ${markdownFullOutputPath}`);
					new Notice(`Markitdown: Converted (simulated) ${path.basename(sourceFilePath)} to vault.`);
				} else { // eventType === 'change'
					console.log(`Successfully updated placeholder Markdown file: ${markdownFullOutputPath}`);
					new Notice(`Markitdown: Updated (simulated) ${path.basename(sourceFilePath)} in vault.`);
				}
			} catch (error) {
				console.error(`Error writing placeholder Markdown file ${markdownFullOutputPath}:`, error);
				new Notice(`Markitdown: Error creating file for ${sourceFileNameWithoutExt}.`);
			}
		}
	}

	onunload() {
		console.log("Unloading Markitdown plugin");
		if (this.externalFolderWatcher) {
			console.log("Stopping external folder watcher.");
			this.externalFolderWatcher.close();
			this.externalFolderWatcher = null;
        }
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}