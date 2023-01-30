"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const walkdir_1 = __importDefault(require("walkdir"));
const mkdirp_1 = __importDefault(require("mkdirp"));
const normalize_path_1 = __importDefault(require("normalize-path"));
const webpack_merge_1 = __importDefault(require("webpack-merge"));
const minimatch_1 = __importDefault(require("minimatch"));
const extra_typings_1 = require("@commander-js/extra-typings");
const program = new extra_typings_1.Command();
const rw_build_util_1 = require("rw-build-util");
const { build } = rw_build_util_1.tomlbuilder;
const { optional, some, none } = rw_build_util_1.opt;
const { ok, err } = rw_build_util_1.result;
function filterValueFunc(v) {
    function func(value) {
        if (!value) {
            return v;
        }
        else {
            throw ok(value);
        }
    }
    return func;
}
const filterMethods = {
    "replace": (params, value, error) => {
        const v = value();
        if (typeof v == 'string') {
            if (params.length >= 2 && typeof params[0] == 'string' && typeof params[1] == 'string') {
                const [reg, rep] = [new RegExp(params[0]), params[1]];
                const ret = v.replace(reg, rep);
                value(ret);
            }
            else {
                error(new Error(`type of ${v}(${typeof v}) is not suitable for "replace" method`));
            }
        }
        else {
            error(new Error(`type of ${v}(${typeof v}) is not suitable for "replace" method`));
        }
    }
};
function normalize(pat) {
    return (0, normalize_path_1.default)((0, normalize_path_1.default)(pat));
}
async function walkdirAsync(path, callback) {
    return new Promise((resolve, reject) => {
        const emmiter = (0, walkdir_1.default)(path, callback);
        emmiter.on('error', () => {
            reject();
        });
        emmiter.on('end', () => {
            resolve(null);
        });
    });
}
async function serializeConfigToml(tomlPath) {
    return fs_extra_1.default.readFile(tomlPath).then((result) => {
        return JSON.parse(result.toString());
    }).catch((error) => {
        console.error(`config file ${tomlPath} cannot be read.`);
        console.error(error);
        process.exit(-4);
    }).then(async (tom) => {
        let conf = tom;
        if (conf.imports) {
            const impProms = [];
            for (const imp of conf.imports) {
                impProms.push([serializeConfigToml(path_1.default.join(path_1.default.dirname(tomlPath), imp)), imp]);
            }
            for (const impProm of impProms) {
                const impConf = await impProm[0];
                const imp = impProm[1];
                if (impConf.imports) {
                    impConf.imports = impConf.imports.map((x) => normalize(path_1.default.join(path_1.default.dirname(tomlPath), imp, path_1.default.dirname(imp), x)));
                }
                conf = (0, webpack_merge_1.default)(conf, impConf);
            }
        }
        return conf;
    });
}
program.name('rwbuild')
    .version('2.0.0')
    .description('A CLI tool for building Rusted Warfare mods.WORK IN PROGRESS.');
program.command('build')
    .option('--outdir <outdir>', 'locate the output directory', 'build')
    .option('--srcdir <srcdir>', 'locate the source directory', 'src')
    .option('--rootdir <rootdir>', 'locate the root directory', '.')
    .option('--config <config-file>', 'locate the config file', 'rwbuild.config.json')
    .action(async ({ outdir, srcdir, rootdir, config }) => {
    const paths = [];
    const walkProm = walkdirAsync(path_1.default.join(rootdir, srcdir), (pat, stat) => {
        if (stat.isFile()) {
            paths.push(path_1.default.normalize(pat));
        }
    });
    const tomls = [];
    const ignorePaths = [path_1.default.join(rootdir, config)];
    const filterConfigs = [];
    await serializeConfigToml(path_1.default.join(rootdir, config)).then((conf) => {
        if (conf.imports) {
            conf.imports.forEach((x) => ignorePaths.push(x));
        }
        if (conf.filters) {
            conf.filters.forEach((x) => filterConfigs.push(x));
        }
    });
    await walkProm;
    for (const pat of paths) {
        if (path_1.default.basename(pat) == config || ignorePaths.find((v) => (0, minimatch_1.default)(pat, v))) {
            continue;
        }
        if (path_1.default.extname(pat) == '.toml') {
            const buffer = await fs_extra_1.default.readFile(pat);
            const result = rw_build_util_1.rwtoml.fromString(buffer.toString());
            result.ok((toml) => tomls.push([pat, toml]));
            result.err((error) => {
                console.error(buffer.toString());
                console.error(error);
                process.exit(-3);
            });
        }
    }
    const result = build({
        customPreConverters: [
            (obj) => {
                const { context, source } = obj;
                const res = {};
                rw_build_util_1.rwtoml.forEach(source.content, ({ secMain, secSub, key, value }) => {
                    if (!res[secMain]) {
                        res[secMain] = {};
                    }
                    secSub.some((secSub) => {
                        if (!res[secMain][secSub]) {
                            res[secMain][secSub] = {};
                        }
                        res[secMain][secSub][key] = value;
                    });
                    secSub.none(() => {
                        res[secMain][key] = value;
                    });
                });
                for (const filterConfig of filterConfigs) {
                    if (filterConfig.rules) {
                        for (const rule of filterConfig.rules) {
                            if (rule.transform && filterMethods[rule.transform.method]) {
                                const selector = rule.transform.selector;
                                rw_build_util_1.rwtoml.forEach(res, ({ secMain, secSub, key, value }) => {
                                    if ((selector.secMain ? secMain == selector.secMain : true)
                                        && (selector.secSub ? selector.secSub == secSub.unwrap() : true)
                                        && (selector.key ? selector.key == key : true)) {
                                        try {
                                            filterMethods[rule.transform.method](rule.transform.params, filterValueFunc(value), (e) => { throw (err(e)); });
                                        }
                                        catch (result) {
                                            if (result instanceof Error) {
                                                console.error(result);
                                                process.exit(-6);
                                            }
                                            const re = result;
                                            re.ok((v) => {
                                                secSub.some((secSub) => {
                                                    res[secMain][secSub][key] = v;
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
                const target = {
                    path: source.path.slice(),
                    content: res,
                    from: some(source),
                    to: none()
                };
                source.to = some(target);
                context.targets.push(target);
                return ok({ context, target });
            }
        ],
        context: {
            sources: tomls.map(([pat, toml]) => {
                const pathr = path_1.default.relative(srcdir, pat).replace(/\.toml/, '').split(path_1.default.sep);
                return {
                    path: pathr,
                    content: toml,
                    from: none(),
                    to: none()
                };
            }),
            targets: [],
            into() {
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
        for (const [pat, ini] of targets.map((x) => {
            return [path_1.default.join(outdir, path_1.default.join(...x.path.map((v) => v)) + '.ini'), rw_build_util_1.rwini.toString(x.content)];
        })) {
            await (0, mkdirp_1.default)(path_1.default.dirname(pat));
            try {
                await fs_extra_1.default.writeFile(pat, ini);
            }
            catch (error) {
                console.error(error);
                process.exit(-2);
            }
        }
    });
});
program.parse();
