import path from "path";
import fs from "fs-extra";
import os from "os";
import walkdir from "walkdir";
import mkdirp from "mkdirp";
import toml from "toml";
import normalizePath from "normalize-path";
import dclone from "clone";
import merge from "webpack-merge";
import minimatch from "minimatch";
import { Command } from "@commander-js/extra-typings";
const program = new Command();

import { presetRwTomlConverter, RwTomlConverterContext, RwTomlObject } from "rw-build-util/lib/builder/toml";
import { RwToml, Value as TomlValue, Scalar, Section as TomlSection } from "rw-build-util/lib/data/toml";
import { rwtoml, rwini, rwbuilder, tomlbuilder, opt, result, modpath } from "rw-build-util"
import { Path } from "rw-build-util/lib/util/path";
import { Optional } from "rw-build-util/lib/util/optional";
import { Result } from "rw-build-util/lib/util/result";
import { Value } from "rw-build-util/lib/data/ini";
const { build } = tomlbuilder;
const { optional, some, none } = opt;
const { ok, err } = result;

type FilterRule = {
    transform?: {
        method: string,
        selector: {
            secMain?: string,
            secSub?: string,
            key?: string
        },
        params: (number | string | boolean)[]
    }
}

type ValueHandler<T> = {
    (set: T): never;
    (): T;
}

function filterValueFunc<T>(v: T) {
    function func(value: T): never;
    function func(): T;
    function func(value?: T): T | never {
        if(!value) {
            return v;
        } else {
            throw ok<T, Error>(value);
        }
    }
    return func;
}

const filterMethods: Record<
    string, 
    (
        params: (number | string | boolean)[], 
        value: ValueHandler<number | string | boolean | number[] | string[] | boolean[]>,
        error: (error: Error) => void
    ) => void
> = {
    "replace": (params, value, error) => {
        const v = value();
        if(typeof v == 'string') {
            if(params.length >= 2 && typeof params[0] == 'string' && typeof params[1] == 'string') {
                const [reg, rep] = [new RegExp(params[0]), params[1]];
                const ret = v.replace(reg, rep);
                value(ret);
            } else {
                error(new Error(`type of ${v}(${typeof v}) is not suitable for "replace" method`));
            }
        } else {
            error(new Error(`type of ${v}(${typeof v}) is not suitable for "replace" method`));
        }
    }
};

type FilterConfig = {
    include?: string[],
    exclude?: string[],
    rules?: FilterRule[],
}

type ConfigToml = {
    filters?: FilterConfig[],
    imports?: string[]
}

type Item<T> = T extends Array<infer I> ? I : never;

function normalize(pat: string): string {
    return normalizePath(normalizePath(pat));
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
        return JSON.parse(result.toString());
    }).catch((error) => {
        console.error(`config file ${tomlPath} cannot be read.`);
        console.error(error);
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
                    impConf.imports = impConf.imports.map((x) => normalize(path.join(path.dirname(tomlPath), imp, path.dirname(imp), x)));
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
    .option('--config <config-file>', 'locate the config file', 'rwbuild.config.json')
    .action(async ({outdir, srcdir, rootdir, config}) => {
        const paths: string[] = [];
        const walkProm = walkdirAsync(path.join(rootdir, srcdir), (pat, stat) => {
            if(stat.isFile()) {
                paths.push(path.normalize(pat));
            }
        });
        const tomls: [string, RwToml][] = [];
        const ignorePaths: string[] = [path.join(rootdir, config)];
        const filterConfigs: FilterConfig[] = [];
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
            customPreConverters: [
                (obj: {
                    context: RwTomlConverterContext,
                    source: RwTomlObject
                }): Result<{context: RwTomlConverterContext, target: RwTomlObject}, Error> => {
                    const {context, source} = obj;
                    const res: RwToml = {};
                    rwtoml.forEach(source.content, ({secMain, secSub, key, value}) => {
                        if(!res[secMain]) {
                            res[secMain] = {};
                        }
                        secSub.some((secSub) => {
                            if(!res[secMain][secSub]) {
                                res[secMain][secSub] = {};
                            }
                            (res[secMain][secSub] as TomlSection)[key] = value;
                        });
                        secSub.none(() => {
                            res[secMain][key] = value;
                        });
                    });
                    for(const filterConfig of filterConfigs) {
                        if(filterConfig.rules) {
                            for(const rule of filterConfig.rules) {
                                if(rule.transform && filterMethods[rule.transform.method]) {
                                    const selector = rule.transform.selector;
                                    rwtoml.forEach(res, ({secMain, secSub, key, value}) => {
                                        if(
                                            (selector.secMain ? secMain == selector.secMain : true) 
                                                && (selector.secSub ? selector.secSub == secSub.unwrap() : true) 
                                                && (selector.key ? selector.key == key : true)
                                        )  {
                                            try {
                                                filterMethods[rule.transform!.method](rule.transform!.params, filterValueFunc(value), (e) => {throw(err<Value, Error>(e))});
                                            } catch(result) {
                                                if(result instanceof Error) {
                                                    console.error(result);
                                                    process.exit(-6);
                                                }
                                                const re = result as Result<TomlValue, Error>;
                                                re.ok((v) => {
                                                    secSub.some((secSub) => {
                                                        (res[secMain][secSub] as TomlSection)[key] = v;
                                                    });
                                                    secSub.none(() => {
                                                        res[secMain][key] = v;
                                                    });
                                                });
                                                re.err((e) => {
                                                    console.error(e);
                                                    process.exit(-5);
                                                });
                                            }
                                        }
                                    });
                                }
                            }
                        }
                    }
                    const target: RwTomlObject = {
                        path: source.path.slice(),
                        content: res,
                        from: some(source),
                        to: none()
                    };
                    source.to = some(target);
                    context.targets.push(target);
                    return ok({context, target});
                }
            ],
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