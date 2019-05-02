/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';

import { Id } from 'lsif-protocol';

export namespace FileType {
	export const Unknown: 0 = 0;
	export const File: 1 = 1;
	export const Directory: 2 = 2;
	export const SymbolicLink: 64 = 64;
}

export type FileType = 0 | 1 | 2 | 64;

export interface FileStat {
	type: FileType;
	ctime: number;
	mtime: number;
	size: number;
}

export interface DocumentInfo {
	id: Id;
	uri: string;
}

interface File extends FileStat {
	type: 1;
	name: string;
	id: Id;
}

namespace File {
	export function create(name: string, id: Id): File {
		return { type: FileType.File, ctime: Date.now(), mtime: Date.now(), size: 0, name, id };
	}
}

interface Directory extends FileStat {
	type: 2;
	name: string;
	children: Map<string, Entry>;
}

namespace Directory {
	export function create(name: string): Directory {
		return { type: FileType.Directory, ctime: Date.now(), mtime: Date.now(), size: 0, name, children: new Map() }
	}
}

export type Entry = File | Directory;

export class FileSystem {

	private outside: Map<string, Id>;
	private root: Directory;

	constructor(private projectRoot: string, documents: DocumentInfo[]) {
		this.root = Directory.create('');
		this.outside = new Map();
		for (let info of documents) {
			// Do not show file outside the projectRoot.
			if (!info.uri.startsWith(projectRoot)) {
				this.outside.set(info.uri, info.id);
				continue;
			}
			let p = info.uri.substring(projectRoot.length + 1);
			let dirname = path.posix.dirname(p);
			let basename = path.posix.basename(p);
			let entry = this.lookup(dirname, true);
			if (entry && entry.type === FileType.Directory) {
				entry.children.set(basename, File.create(basename, info.id));
			}
		}
	}

	public stat(uri: string): FileStat | null {
		if (!uri.startsWith(this.projectRoot)) {
			return null;
		}
		let p = uri.substring(this.projectRoot.length + 1);
		let entry = this.lookup(p, false);
		return entry ? entry : null;
	}

	public readDirectory(uri: string): [string, FileType][] {
		if (!uri.startsWith(this.projectRoot)) {
			return [];
		}
		let p = uri.substring(this.projectRoot.length + 1);
		let entry = this.lookup(p, false);
		if (entry === undefined || entry.type !== FileType.Directory) {
			return [];
		}
		let result: [string, FileType][] = [];
		for (let child of entry.children.values()) {
			result.push([child.name, child.type]);
		}
		return result;
	}

	public getFileId(uri: string): Id | undefined {
		let result = this.outside.get(uri);
		if (result !== undefined) {
			return result;
		}
		if (!uri.startsWith(this.projectRoot)) {
			return undefined;
		}
		let entry = this.lookup(uri.substring(this.projectRoot.length + 1));
		return entry && entry.type === FileType.File ? entry.id : undefined;
	}

	private lookup(uri: string, create: boolean = false): Entry | undefined {
		let parts = uri.split('/');
		let entry: Entry = this.root;
		for (const part of parts) {
			if (!part || part === '.') {
				continue;
			}
			let child: Entry | undefined;
			if (entry.type === FileType.Directory) {
				child = entry.children.get(part);
				if (child === undefined && create) {
					child = Directory.create(part);
					entry.children.set(part, child);
				}
			}
			if (!child) {
				return undefined;
			}
			entry = child;
		}
		return entry;
	}
}