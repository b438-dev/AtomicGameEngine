//
// Copyright (c) 2014-2016 THUNDERBEAST GAMES LLC
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

import * as EditorEvents from "../../editor/EditorEvents";

/**
 * Resource extension that supports the web view typescript extension
 */
export default class TypescriptLanguageExtension implements Editor.HostExtensions.ResourceServicesEventListener, Editor.HostExtensions.ProjectServicesEventListener {
    name: string = "HostTypeScriptLanguageExtension";
    description: string = "This service supports the typscript webview extension.";

    /**
     * Indicates if this project contains typescript files.
     * @type {Boolean}
     */
    private isTypescriptProject = false;
    private serviceRegistry: Editor.HostExtensions.HostServiceLocator = null;
    /**
     * Determines if the file name/path provided is something we care about
     * @param  {string} path
     * @return {boolean}
     */
    private isValidFiletype(path: string): boolean {
        if (this.isTypescriptProject) {
            const ext = Atomic.getExtension(path);
            if (ext == ".ts") {
                return true;
            }
        }
        return false;
    }

    /**
     * Build an in-memory config file to be sent down to the web view client.  This will scan the resources directory
     * and generate a file list
     */
    private buildTsConfig(): any {
        let projectFiles: Array<string> = [];

        //scan all the files in the project for any typescript files so we can determine if this is a typescript project
        Atomic.fileSystem.scanDir(ToolCore.toolSystem.project.resourcePath, "*.ts", Atomic.SCAN_FILES, true).forEach(filename => {
            projectFiles.push(Atomic.addTrailingSlash(ToolCore.toolSystem.project.resourcePath) + filename);
            this.isTypescriptProject = true;
        });

        // only build out a tsconfig.atomic if we actually have typescript files in the project
        if (this.isTypescriptProject) {
            // First we need to load in a copy of the lib.core.d.ts that is necessary for the hosted typescript compiler
            projectFiles.push(Atomic.addTrailingSlash(Atomic.addTrailingSlash(ToolCore.toolEnvironment.toolDataDir) + "TypeScriptSupport") + "lib.core.d.ts");

            // Then see if we have a copy of Atomic.d.ts in the project directory.  If we don't then we should load it up from the tool environment
            let found = false;
            projectFiles.forEach((file) => {
                if (file.indexOf("Atomic.d.ts") != -1) {
                    found = true;
                }
            });

            if (!found) {
                // Load up the Atomic.d.ts from the tool core
                projectFiles.push(Atomic.addTrailingSlash(Atomic.addTrailingSlash(ToolCore.toolEnvironment.toolDataDir) + "TypeScriptSupport") + "Atomic.d.ts");
            }

            let files = projectFiles.map((f: string) => {
                if (f.indexOf(ToolCore.toolSystem.project.resourcePath) != -1) {
                    // if we are in the resources directory, just pass back the path from resources down
                    return f.replace(Atomic.addTrailingSlash(ToolCore.toolSystem.project.projectPath), "");
                } else {
                    // otherwise return the full path
                    return f;
                }
            });

            let tsConfig = {
                files: files
            };

            return tsConfig;
        } else {
            return {
                files: []
            };
        }
    }

    /**
     * Inject this language service into the registry
     * @return {[type]}             True if successful
     */
    initialize(serviceLocator: Editor.HostExtensions.HostServiceLocator) {
        // We care about both resource events as well as project events
        serviceLocator.resourceServices.register(this);
        serviceLocator.projectServices.register(this);
        serviceLocator.uiServices.register(this);
        this.serviceRegistry = serviceLocator;
    }

    /**
     * Handle the delete.  This should delete the corresponding javascript file
     * @param  {Editor.EditorEvents.DeleteResourceEvent} ev
     */
    delete(ev: Editor.EditorEvents.DeleteResourceEvent) {
        if (this.isValidFiletype(ev.path)) {
            // console.log(`${this.name}: received a delete resource event`);

            // Delete the corresponding js file
            let jsFile = ev.path.replace(/\.ts$/, ".js");
            let jsFileAsset = ToolCore.assetDatabase.getAssetByPath(jsFile);
            if (jsFileAsset) {
                console.log(`${this.name}: deleting corresponding .js file`);
                ToolCore.assetDatabase.deleteAsset(jsFileAsset);

                let eventData: EditorEvents.DeleteResourceEvent = {
                    path: jsFile
                };

                this.setTsConfigOnWebView(this.buildTsConfig());
                this.serviceRegistry.sendEvent(EditorEvents.DeleteResourceNotification, eventData);
            }
        }
    }

    /**
     * Handle the rename.  Should rename the corresponding .js file
     * @param  {Editor.EditorEvents.RenameResourceEvent} ev
     */
    rename(ev: Editor.EditorEvents.RenameResourceEvent) {
        if (this.isValidFiletype(ev.path)) {
            // console.log(`${this.name}: received a rename resource event`);

            // Rename the corresponding js file
            let jsFile = ev.path.replace(/\.ts$/, ".js");
            let jsFileNew = ev.newPath.replace(/\.ts$/, ".js"); // rename doesn't want extension
            let jsFileAsset = ToolCore.assetDatabase.getAssetByPath(jsFile);
            if (jsFileAsset) {
                console.log(`${this.name}: renaming corresponding .js file`);
                jsFileAsset.rename(ev.newName);

                let eventData: EditorEvents.RenameResourceEvent = {
                    path: jsFile,
                    newPath: jsFileNew,
                    newName: ev.newName,
                    asset: jsFileAsset
                };

                this.setTsConfigOnWebView(this.buildTsConfig());
                this.serviceRegistry.sendEvent(EditorEvents.RenameResourceNotification, eventData);
            }
        }
    }

    /**
     * Handles the save event and detects if a typescript file has been added to a non-typescript project
     * @param  {Editor.EditorEvents.SaveResourceEvent} ev
     * @return {[type]}
     */
    save(ev: Editor.EditorEvents.SaveResourceEvent) {
        // let's check to see if we have created a typescript file
        if (!this.isTypescriptProject) {
            if (Atomic.getExtension(ev.path) == ".ts") {
                this.isTypescriptProject = true;
                this.setTsConfigOnWebView(this.buildTsConfig());
            }
        }
    }

    /*** ProjectService implementation ****/

    /**
     * Called when the project is being loaded to allow the typscript language service to reset and
     * possibly compile
     */
    projectLoaded(ev: Editor.EditorEvents.LoadProjectEvent) {
        // got a load, we need to reset the language service
        console.log(`${this.name}: received a project loaded event for project at ${ev.path}`);
        this.setTsConfigOnWebView(this.buildTsConfig());
        this.rebuildMenu();
    }


    /**
     * Rebuilds the plugin menu.  This is needed to toggle the CompileOnSave true or false
     */
    rebuildMenu() {
        if (this.isTypescriptProject) {
            this.serviceRegistry.uiServices.removePluginMenuItemSource("TypeScript");
            const isCompileOnSave = this.serviceRegistry.projectServices.getUserPreference(this.name, "CompileOnSave", false);
            let subMenu = {};
            if (isCompileOnSave) {
                subMenu["Compile on Save: On"] = [`${this.name}.compileonsave`];
            } else {
                subMenu["Compile on Save: Off"] = [`${this.name}.compileonsave`];
            }
            subMenu["Compile Project"] = [`${this.name}.compileproject`];
            this.serviceRegistry.uiServices.createPluginMenuItemSource("TypeScript", subMenu);
        }
    }

    /*** UIService implementation ***/

    /**
     * Called when a plugin menu item is clicked
     * @param  {string} refId
     * @return {boolean}
     */
    menuItemClicked(refId: string): boolean {
        let [extension, action] = refId.split(".");
        if (extension == this.name) {
            switch (action) {
                case "compileonsave":
                    // Toggle
                    const isCompileOnSave = this.serviceRegistry.projectServices.getUserPreference(this.name, "CompileOnSave", false);
                    this.serviceRegistry.projectServices.setUserPreference(this.name, "CompileOnSave", !isCompileOnSave);
                    this.rebuildMenu();
                    return true;
                case "compileproject":
                    this.doFullCompile();
                    return true;
            }
        }
    }

    /**
     * Handle messages that are submitted via Atomic.Query from within a web view editor.
     * @param message The message type that was submitted to be used to determine what the data contains if present
     * @param data any additional data that needs to be submitted with the message
     */
    handleWebMessage(messageType: string, data: any) {
        switch (messageType) {
            case "TypeScript.DisplayCompileResults":
                this.displayCompileResults(data.annotations);
                break;
        }
    }

    setTsConfigOnWebView(tsConfig: any) {
        WebView.WebBrowserHost.setGlobalStringProperty("TypeScriptLanguageExtension", "tsConfig", JSON.stringify(tsConfig));
    }

    /**
     * Perform a full compile of the TypeScript
     */
    doFullCompile() {
        const editor = this.serviceRegistry.uiServices.getCurrentResourceEditor();
        if (editor && editor.typeName == "JSResourceEditor") {
            const jsEditor = <Editor.JSResourceEditor>editor;
            jsEditor.webView.webClient.executeJavaScript(`TypeScript_DoFullCompile();`);
        } else {
            this.serviceRegistry.uiServices.showModalError("TypeScript Compilation", "Please open a TypeScript file in the editor before attempting to do a full compile.");
        }

        // Ideally, we would want to either launch up a background web view, or shell out to node or something and not
        // need to have an editor open.  Still researching this
        /*
            const url = `atomic://${ToolCore.toolEnvironment.toolDataDir}CodeEditor/Editor.html`;
            const webClient = new WebView.WebClient();
            this.webClient = webClient;
            //this.webClient.loadURL(url);

            const webTexture = new WebView.WebTexture2D();
            webClient.webRenderHandler = webTexture;

            // doesn't work because atomicquery doesn't seem to be exposed to WebView.WebClient instances
            webClient.subscribeToEvent(EditorEvents.WebMessage, (data) => {
                switch (data.message) {
                    case "editorLoadComplete":
                        webClient.unsubscribeFromEvent(EditorEvents.WebMessage);
                        webClient.executeJavaScript(`TypeScript_DoFullCompile();`);
                        break;
                }
            });

            webClient.createBrowser(url, 1, 1);
        */
    }

    /**
     * Display the results of the compilation step
     * @param  {any[]} annotations
     */
    displayCompileResults(annotations: any[]) {
        // get the name of the resources directory without preceding path
        let resourceDir = ToolCore.toolSystem.project.resourcePath.replace(Atomic.addTrailingSlash(ToolCore.toolSystem.project.projectPath), "");
        console.log(resourceDir);
        let messageArray = annotations.filter(result => {
            // If we are compiling the lib.d.ts or some other built-in library and it was successful, then
            // we really don't need to display that result since it's just noise.  Only display it if it fails
            if (result.type == "success") {
                return result.file.indexOf(resourceDir) == 0;
            }
            return true;
        }).map(result => {
            let message = `<color #888888>${result.file}: </color>`;
            if (result.type == "success") {
                message += `<color #00ff00>${result.text}</color>`;
            } else {
                message += `<color #e3e02b>${result.text} at line ${result.row} col ${result.column}</color>`;
            }
            return message;
        });

        if (messageArray.length == 0) {
            messageArray.push("Success");
        }
        this.serviceRegistry.uiServices.showModalError("TypeScript Compilation Results", messageArray.join("\n"));
    }
}
