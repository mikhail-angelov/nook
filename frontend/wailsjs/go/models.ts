export namespace backend {
	
	export class ChatSessionMetadata {
	    id: string;
	    title: string;
	    provider: string;
	    model: string;
	    systemPrompt: string;
	    summary: string;
	    started_at: number;
	    updated_at: number;
	    message_count: number;
	
	    static createFrom(source: any = {}) {
	        return new ChatSessionMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.provider = source["provider"];
	        this.model = source["model"];
	        this.systemPrompt = source["systemPrompt"];
	        this.summary = source["summary"];
	        this.started_at = source["started_at"];
	        this.updated_at = source["updated_at"];
	        this.message_count = source["message_count"];
	    }
	}
	export class ScannedNote {
	    id: string;
	    path: string;
	    title: string;
	    body?: string;
	    is_secure: boolean;
	    mtime: number;
	    created_at: number;
	    tags: string[];
	    wikilinks: string[];
	
	    static createFrom(source: any = {}) {
	        return new ScannedNote(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.title = source["title"];
	        this.body = source["body"];
	        this.is_secure = source["is_secure"];
	        this.mtime = source["mtime"];
	        this.created_at = source["created_at"];
	        this.tags = source["tags"];
	        this.wikilinks = source["wikilinks"];
	    }
	}
	export class Settings {
	    vaultFolder: string;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.vaultFolder = source["vaultFolder"];
	    }
	}

}

