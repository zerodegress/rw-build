import path from "path";
import fs from "fs-extra";
import os from "os";
import walkdir from "walkdir";
import mkdirp from "mkdirp";
import toml from "toml";
import dclone from "clone";
import merge from "webpack-merge";
import minimatch from "minimatch";
import { Command } from "@commander-js/extra-typings";
const program = new Command();

import { RwTomlConverterContext } from "rw-build-util/lib/builder/toml";
import { RwToml } from "rw-build-util/lib/data/toml";
import { rwtoml, rwini, rwbuilder, tomlbuilder, opt, result, modpath } from "rw-build-util"
import { Path } from "rw-build-util/lib/util/path";
const { build } = tomlbuilder;
const { optional, some, none } = opt;
const { ok, err } = result;

type FilterRule = {
    path?: {from: string, to: string},
    code?: {from: RwToml, to: RwToml}
}

type FilterConfig = {
    include?: string[],
    exclude?: string[],
    rules?: FilterRule[],
}

type ConfigToml = {
    filters?: (string | FilterConfig)[],
    imports?: string[]
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

async function serializeConfigToml(tomlPath: string): Promise<ConfigToml> {
    return fs.readFile(tomlPath).then((result) => {
        return toml.parse(result.toString());
    }).catch((error) => {
        console.error(`config file ${tomlPath} cannot be read.`);
        console.error(err);
        process.exit(-4);
    }).then(async (tom) => {
        let conf = tom as ConfigToml;
        if(conf.imports) {
            const impProms: [Promise<ConfigToml>, string][] = [];
            for(const imp of conf.imports) {
                impProms.push([serializeConfigToml(path.join(path.dirname(tomlPath), imp)), imp]);
            }
            for(const impProm of impProms) {
                const impConf = await impProm[0];
                const imp = impProm[1];
                if(impConf.imports) {
                    impConf.imports = impConf.imports.map((x) => path.join(path.dirname(tomlPath), imp, path.dirname(imp), x));
                }
                conf = merge(conf, impConf);
            }
        }
        return conf;
    })
}

program.name('rwbuild')
    .version('2.0.0')
    .description('A CLI tool for building Rusted Warfare mods.WORK IN PROGRESS.');

program.command('build')
    .option('--outdir <outdir>', 'locate the output directory', 'build')
    .option('--srcdir <srcdir>', 'locate the source directory', 'src')
    .option('--rootdir <rootdir>', 'locate the root directory', '.')
    .option('--config <config-file>', 'locate the config file', 'rwbuild.config.toml')
    .action(async ({outdir, srcdir, rootdir, config}) => {
        const paths: string[] = [];
        const walkProm = walkdirAsync(path.join(rootdir, srcdir), (pat, stat) => {
            if(stat.isFile()) {
                paths.push(path.normalize(pat));
            }
        });
        const tomls: [string, RwToml][] = [];
        const ignorePaths: string[] = [path.join(rootdir, config)];
        const filterConfigs: (FilterConfig | string)[] = [];
        await serializeConfigToml(path.join(rootdir, config)).then((conf) => {
            if(conf.imports) {
                conf.imports.forEach((x) => ignorePaths.push(x));
            }
            if(conf.filters) {
                conf.filters.forEach((x) => filterConfigs.push(x));
            }
        });
        await walkProm;
        for(const pat of paths) {
            if(path.basename(pat) == config || ignorePaths.find((v) => minimatch(pat, v))) {
                continue;
            }
            if(path.extname(pat) == '.toml') {
                const buffer = await fs.readFile(pat);
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
                return [path.join(outdir, path.join(...x.path.map((v) => v)) + '.ini'), rwini.toString(x.content)]
            })) {
                await mkdirp(path.dirname(pat));
                try {
                    await fs.writeFile(pat, ini);
                } catch (error) {
                    console.error(error);
                    process.exit(-2);
                }
            }
        });
    });

program.parse();