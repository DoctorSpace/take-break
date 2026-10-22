export interface ReleaseFile {name: string; path: string; size: number; mtimeMs: number; sha256: string}
export interface ReleaseLink {name: string; url: string; direct_asset_path: string; link_type: string}
export interface PublishOptions {
  tag: string; project: string; directory?: string; apiUrl?: string;
  token?: string; jobToken?: string; name?: string; description?: string;
  dryRun?: boolean; logger?: (message: string) => void; fetchImpl?: typeof fetch;
}
export interface PublishResult {tag: string; files: string[]; links: ReleaseLink[]; dryRun: boolean; releaseURL: string | null}
export function collectReleaseFiles(directory: string): Promise<ReleaseFile[]>;
export function releaseLinks(options: {apiUrl: string; project: string; tag: string; packageName?: string}, files: Pick<ReleaseFile, 'name'>[]): ReleaseLink[];
export function publishRelease(options: PublishOptions): Promise<PublishResult>;
export function main(args?: string[], env?: NodeJS.ProcessEnv): Promise<PublishResult | undefined>;
