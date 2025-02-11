/* -------------------------------------------------------------------------
 * Original work Copyright (c) Microsoft Corporation. All rights reserved.
 * Original work licensed under the MIT License.
 * See ThirdPartyNotices.txt in the project root for license information.
 * All modifications Copyright (c) Open Law Library. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http: // www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ----------------------------------------------------------------------- */
"use strict";

import fs from 'fs';

import * as vscode from "vscode";

import which from "which";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State,
} from "vscode-languageclient/node";

let client: LanguageClient;
let clientStarting = false
let logger: vscode.LogOutputChannel

/**
 * This is the main entry point.
 * Called when vscode first activates the extension
 */
export async function activate(context: vscode.ExtensionContext) {
  logger = vscode.window.createOutputChannel('LFortran Language Server', {
    log: true
  });

  logger.info("Extension activated.");
  await startLangServer();
}

async function checkPathExistsAndIsExecutable(path: string): Promise<boolean> {
  let pathExistsAndIsExecutable: boolean = false;

  try {
    const stats = await fs.promises.stat(path);
    pathExistsAndIsExecutable = stats.isFile() && (stats.mode & 0o111) !== 0;
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err; // Other errors
    }
  }

  return pathExistsAndIsExecutable;
}

async function getLFortranPath(): Promise<string | null | undefined> {
  const compilerSettings =
    vscode.workspace.getConfiguration("LFortranLanguageServer.compiler");
  let lfortranPath = compilerSettings.get<string>("lfortranPath");
  if (lfortranPath === "lfortran"
    || !(await checkPathExistsAndIsExecutable(lfortranPath))) {
    lfortranPath = await which("lfortran", { nothrow: true });
  }
  logger.info(`lfortranPath = ${lfortranPath}`);
  return lfortranPath;
}

/**
 * Start (or restart) the language server.
 *
 * @param command The executable to run
 * @param args Arguments to pass to the executable
 * @returns
 */
async function startLangServer() {

  // Don't interfere if we are already in the process of launching the server.
  if (clientStarting) {
    logger.info("clientStarting, returning ...");
    return;
  }

  clientStarting = true;
  if (client) {
    await stopLangServer();
  }

  const lfortranPath = await getLFortranPath();
  if (!lfortranPath) {
    logger.warn("lfortran command not found.");
    clientStarting = false;
    return;
  }

  const serverOptions: ServerOptions = {
    command: lfortranPath,
    args: [
      "server",
    ],
    options: {
      env: process.env,
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      {
        scheme: "file",
        language: "fortran"
      },
    ],
    outputChannel: logger,
    connectionOptions: {
      maxRestartCount: 0 // don't restart on server failure.
    },
  };

  client = new LanguageClient(
    "LFortranLanguageServer",
    "LFortran Language Server",
    serverOptions,
    clientOptions);

  const promises = [client.start()]

  const results = await Promise.allSettled(promises)
  clientStarting = false

  for (const result of results) {
    if (result.status === "rejected") {
      logger.error(`There was a error starting the server: ${result.reason}`)
    }
  }
}

export function deactivate(): Thenable<void> {
  return stopLangServer();
}

async function stopLangServer(): Promise<void> {
  logger.info("Stopping lang server ...");
  if (!client) {
    logger.info("No client to stop, returning...");
    return
  }

  if (client.state === State.Running) {
    await client.stop();
    logger.info("Client stopped ...");
  }

  client.dispose()
  client = undefined
}
