import path from "path";
import fs from "fs";
import os from "os";
import walkdir from "walkdir";
import toml from "toml";
import mkdirp from "mkdirp";
import { Command } from "@commander-js/extra-typings";
const program = new Command();

import { build, RwTomlConverterContext } from "rw-build-util/lib/builder/toml";
import { RwToml } from "rw-build-util/lib/data/toml";
import * as rwtoml from "rw-build-util/lib/data/toml";
import * as rwini from "rw-build-util/lib/data/ini";
import { none } from "rw-build-util/lib/util/optional";
import { Path } from "rw-build-util/lib/util/path";

async function readFileAsync(path: fs.PathOrFileDescriptor): Promise<Buffer> {
    return new Promise((resolve, reject) => fs.readFile(path, (error, data) => {
        if(error) {
            reject(error);
        } else {
            resolve(data);
        }
    }));
}

async function writeFileAsync(file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView): Promise<null> {
    return new Promise((resolve, reject) => {
        fs.writeFile(file, data, (error) => {
            if(error) {
                reject(error);
            } else {
                resolve(null);
            }
        })
    });
}

async function walkdirAsync(path: string, callback: (path: string, stat: fs.Stats) => void): Promise<null> {
    return new Promise((resolve, reject) => {
        const emmiter = walkdir(path, callback);
        emmiter.on('error', () => {
            reject();
        });
        emmiter.on('end', () => {
            resolve(null);
        });
    });
}

program.name('rwbuild')
    .version('2.0.0')
    .description('A CLI tool for building Rusted Warfare mods.WORK IN PROGRESS.');

program.command('build')
    .option('--outdir <outdir>', 'locate the output directory', 'build')
    .option('--srcdir <srcdir>', 'locate the source directory', 'src')
    .option('--rootdir <rootdir>', 'locate the root directory', '.')
    .action(async ({outdir, srcdir, rootdir}) => {
        const paths: string[] = [];
        await walkdirAsync(path.join(rootdir, srcdir), (pat, stat) => {
            if(stat.isFile()) {
                paths.push(path.normalize(pat));
            }
        });
        const tomls: [string, RwToml][] = [];
        for(const pat of paths) {
            if(path.extname(pat) == '.toml') {
                const buffer = await readFileAsync(pat);
                const result = rwtoml.fromString(buffer.toString());
                result.ok((toml) => tomls.push([pat, toml]))
                result.err((error) => {
                    console.error(buffer.toString());
                    console.error(error);
                    process.exit(-3);
                });
            }
        }
        const result = build({
            context: {
                sources: tomls.map(([pat, toml]) => {
                    const pathr: Path = path.relative(srcdir, pat).replace(/\.toml/, '').split(path.sep);
                    return {
                        path: pathr,
                        content: toml,
                        from: none(),
                        to: none()
                    };
                }),
                targets: [],
                into(this: RwTomlConverterContext) {
                    return {
                        sources: this.sources.map((x) => {
                            return {
                                path: x.path,
                                content: x.content,
                                from: none(),
                                to: none(),
                            };
                        }),
                        targets: [],
                    };
                }
            }
        });
        result.err((error) => {
            console.error(error);
            process.exit(-1);
        });
        result.ok(async (targets) => {
            for(const [pat, ini] of targets.map((x) => {
                return [path.join(outdir, path.join(...x.path.map((v) => v)) + '.ini'), (() => {
                    let str = '';
                    for(const sec in x.content) {
                        str += `[${sec}]` + '\n';
                        for(const [key, value] of Object.entries(x.content[sec])) {
                            str += `${key}:${value}` + '\n';
                        }
                    }
                    return str;
                })()]
            })) {
                await mkdirp(path.dirname(pat));
                try {
                    await writeFileAsync(pat, ini);
                } catch (error) {
                    console.error(error);
                    process.exit(-2);
                }
            }
        });
    });

program.parse();