import path from "path";
import fs from "fs";
import os from "os";
import walkdir from "walkdir";
import toml from "toml";
import mkdirp from "mkdirp";
import { Command } from "commander";
import { ClassicSource } from "rw-toml";
import { implCommonToml, StandardIni } from "rw-toml/lib/config";
import { err, Result } from "rw-toml/lib/result";
import { ClassicBuilderSync, ClassicTargetFileType } from "rw-toml/lib/builder";
const program = new Command();

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

async function walkdirAsync(path: string, callback: (path: string, stat: fs.Stats) => void): Promise<string[]> {
    const paths = await walkdir.sync(path, callback);
    return paths;
}

program
    .name('rw-build')
    .description('CLI to Rusted Warfare modding build')
    .version('1.0.0');

program.command('build')
    .description('build the mod from source')
    .option('-r, --rootdir <rootdir>', 'locates the root directory for source and output', '.')
    .option('-o, --outputdir <outputdir>', 'locates the output directory for output', 'dist')
    .option('-s, --sourcedir <sourcedir>', 'locates the source directory', 'src')
    .action(async (options) => {
        const rootdir = options.rootdir as string;
        const outputdir = options.outputdir as string;
        const sourcedir = options.sourcedir as string;
        try {
            let promises: [string, Promise<Buffer>][] = [];
            let sources: ClassicSource[] = [];
            const paths = await walkdirAsync(path.join(rootdir, sourcedir), async (pat, stat) => {
                if(stat.isFile()) {
                    promises.push([pat, readFileAsync(pat)]);
                }
            });
            for(const [pat, pro] of promises) {
                try {
                    const data = await pro;
                    if(pat.endsWith('.toml')) {
                        const tom = toml.parse(data.toString());
                        if(implCommonToml(tom)) {
                            sources.push(ClassicSource.toml(path.basename(pat), path.relative(path.join(rootdir, sourcedir), path.dirname(pat)), path.relative(path.join(rootdir, sourcedir), pat), tom));
                        } else {
                            throw err<null>(new Error(`${pat} is not a CommonToml File`));
                        }
                    }
                } catch(error) {
                    if(error instanceof Error) {
                        throw err<null>(error);
                    } else {
                        throw error;
                    }
                }
            }
            new ClassicBuilderSync(rootdir, sourcedir, outputdir, sources).buildAllSync().ok(async (targets) => {
                for(const target of targets) {
                    if(target.targetFile.type == ClassicTargetFileType.INI) {
                        let ini = '';
                        const content = target.targetFile.content as StandardIni;
                        for(const sec in content) {
                            ini += `[${sec}]` + '\n';
                            for(const key in content[sec]) {
                                const value = content[sec][key];
                                if(value.includes(os.EOL) || value.includes('\n')) {
                                    ini += key + ':"""' + value + '"""\n';
                                } else {
                                    ini += key + ':' + value + '\n';
                                }
                            }
                        }
                        await mkdirp(path.join(rootdir, outputdir, target.dirname));
                        await writeFileAsync(path.join(rootdir, outputdir, target.dirname, target.filename), ini);
                    }
                }
            }).err((error) => {throw err<null>(error)});
        } catch(result) {
            if(result instanceof Result) {
                result.err((error) => {
                    console.error(error);
                });
            } else {
                throw result;
            }
        }
    });

program.parse();