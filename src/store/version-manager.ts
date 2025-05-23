import { join } from "@tauri-apps/api/path";
import { exists, mkdir, readDir, watch } from "@tauri-apps/plugin-fs";
import { platform } from "@tauri-apps/plugin-os";
import { atom } from "jotai";
import { unwrap } from "jotai/utils";
import { atomWithQuery } from "jotai-tanstack-query";
import { Octokit } from "octokit";
import { toast } from "sonner";
import { readConfig } from "@/handlers/version-manager";
import { stringifyError } from "@/lib/utils/error";
import { atomKeepLast } from "@/lib/utils/jotai/atom-keep-last";
import { atomWithTauriStore } from "@/lib/utils/jotai/tauri-store";
import { defaultStore, type JotaiStore } from ".";
import { oficialRepo } from "./common";
import { atomEmuInstallsPath } from "./paths";

const currentPlatform = (() => {
    const p = platform();
    if (p === "windows") {
        return "win";
    }
    if (p === "macos") {
        return "macos";
    }
    if (p === "linux") {
        return "linux";
    }
    return p;
})();

export interface EmulatorVersion {
    path: string; // local path directory
    binaryName: string; // Executable name
    repo: string; // repo source
    date: Date; // release date
    version: string; // release version
    name: string; // release name
    prerelease: boolean;
}

export type RemoteEmulatorVersion = Omit<
    EmulatorVersion,
    "path" | "binaryName"
> & {
    url: string; // download url
    notSupported?: boolean; // no available for the current platform
};

const octokit = new Octokit();

export const atomModalVersionManagerIsOpen = atom<boolean>(false);

const atomSelectedVersionRaw = atomWithTauriStore<string, false>(
    "config.json",
    "selected",
    {
        initialValue: "",
    },
);

export const atomSelectedVersion = atom<
    EmulatorVersion | null,
    [EmulatorVersion | string],
    void
>(
    (get) => {
        const raw = get(atomSelectedVersionRaw);
        const installedVersion = get(unwrap(atomInstalledVersions));
        if (!raw || !installedVersion) {
            return null;
        }

        return installedVersion.find((e) => e.path === raw) ?? null;
    },
    (_get, set, value: EmulatorVersion | string) => {
        set(
            atomSelectedVersionRaw,
            typeof value === "string" ? value : value.path,
        );
    },
);

export const atomRemoteList = atomWithTauriStore<string[], false>(
    "config.json",
    "remote_list",
    {
        initialValue: [oficialRepo],
        mergeInitial: false,
    },
);

export const atomAvailableVersions = atomWithQuery((get) => ({
    queryKey: ["github", "available", get(atomRemoteList)] as [
        string,
        string,
        string[],
    ],
    queryFn: async ({
        queryKey: [, , list],
    }: {
        queryKey: [string, string, string[]];
    }) => {
        return (
            await Promise.all(
                list.map(async (repoSource) => {
                    const [owner, repo] = repoSource.split("/");
                    if (!owner || !repo) {
                        return [];
                    }
                    const releaseList = await octokit.rest.repos.listReleases({
                        owner,
                        repo,
                    });
                    if (releaseList.status !== 200) {
                        throw new Error(
                            `Failed to fetch releases ${repoSource}`,
                        );
                    }
                    return releaseList.data
                        .map((release) => {
                            const asset = release.assets.find(
                                (e) =>
                                    e.name.endsWith(".zip") &&
                                    (e.name.includes("sdl") ||
                                        !e.name.includes("qt")) &&
                                    e.name.includes(currentPlatform),
                            );

                            let name = "";
                            if (release.prerelease) {
                                name = "Pre-release";
                            } else {
                                name = release.name || "Unknown";
                                name = name.replaceAll(
                                    /-|(codename)|(shadps4)|(v\.?\d+\.\d+\.\d+)/g,
                                    "",
                                );
                                name = name.replaceAll("  ", "");
                                name = name.trim();
                            }

                            let version = "";
                            if (release.prerelease) {
                                version =
                                    release.tag_name.split("-").pop() ||
                                    "Unknown";
                            } else {
                                version = release.tag_name;
                            }

                            return {
                                repo: repoSource,
                                date: new Date(
                                    asset?.updated_at || release.created_at,
                                ),
                                version,
                                name,
                                prerelease: release.prerelease,
                                url: asset?.browser_download_url || "",
                                notSupported: asset == null,
                            } satisfies RemoteEmulatorVersion;
                        })
                        .filter((e) => e != null);
                }),
            )
        ).flat();
    },
}));

export const atomInstalledVersionsRefresh = atom(0);

export function refreshInstalledVersion(s: JotaiStore) {
    s.set(atomInstalledVersionsRefresh, (prev) => prev + 1);
}

export const atomInstalledVersionsRaw = atom(async (get) => {
    get(atomInstalledVersionsRefresh);
    const installationPath = get(atomEmuInstallsPath);

    if (!installationPath) {
        return [];
    }

    if (!(await exists(installationPath))) {
        return [];
    }

    console.info("Refreshing installed version");

    const dirList = (await readDir(installationPath)).filter(
        (e) => e.isDirectory,
    );

    return (
        await Promise.all(
            dirList.map(async (dir) => {
                const path = await join(installationPath, dir.name);
                return await readConfig(path);
            }),
        )
    ).filter((e) => e != null);
});
export const atomInstalledVersions = atomKeepLast(atomInstalledVersionsRaw);

(() => {
    let unsub: (() => void) | undefined;
    defaultStore.sub(atomEmuInstallsPath, async () => {
        unsub?.();
        unsub = undefined;

        try {
            const path = defaultStore.get(atomEmuInstallsPath);
            if (path) {
                if (!(await exists(path))) {
                    await mkdir(path, { recursive: true });
                }
                unsub = await watch(path, (e) => {
                    if (typeof e.type === "object" && "access" in e.type) {
                        if (
                            e.type.access.kind === "open" &&
                            e.paths.length === 1 &&
                            e.paths[0] === path
                        ) {
                            return;
                        }
                    }
                    refreshInstalledVersion(defaultStore);
                });
            }
        } catch (e: unknown) {
            console.error(e);
            toast.error("Error watching install path: " + stringifyError(e));
        }
    });
})();
