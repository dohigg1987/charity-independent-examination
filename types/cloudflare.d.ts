// eslint-disable-next-line @typescript-eslint/no-empty-object-type
declare interface D1Database {}
declare interface Fetcher { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }
declare interface R2ObjectBody { body: ReadableStream<Uint8Array> | null }
declare interface R2Bucket {
  put(key:string,value:ArrayBuffer,options?:{httpMetadata?:{contentType?:string};customMetadata?:Record<string,string>}):Promise<unknown>;
  get(key:string):Promise<R2ObjectBody|null>;
  delete(key:string):Promise<void>;
}

declare module "cloudflare:workers" {
  export const env: { DB:D1Database; BUCKET?:R2Bucket; ASSETS?:Fetcher; [key:string]:unknown };
}
