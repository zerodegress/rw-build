"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const walkdir_1 = __importDefault(require("walkdir"));
const mkdirp_1 = __importDefault(require("mkdirp"));
const extra_typings_1 = require("@commander-js/extra-typings");
const program = new extra_typings_1.Command();
const toml_1 = require("rw-build-util/lib/builder/toml");
const rwtoml = __importStar(require("rw-build-util/lib/data/toml"));
const optional_1 = require("rw-build-util/lib/util/optional");
async function readFileAsync(path) {
    return new Promise((resolve, reject) => fs_1.default.readFile(path, (error, data) => {
        if (error) {
            reject(error);
        }
        else {
            resolve(data);
        }
    }));
}
async function writeFileAsync(file, data) {
    return new Promise((resolve, reject) => {
        fs_1.default.writeFile(file, data, (error) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(null);
            }
        });
    });
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
program.name('rwbuild')
    .version('2.0.0')
    .description('A CLI tool for building Rusted Warfare mods.WORK IN PROGRESS.');
program.command('build')
    .option('--outdir <outdir>', 'locate the output directory', 'build')
    .option('--srcdir <srcdir>', 'locate the source directory', 'src')
    .option('--rootdir <rootdir>', 'locate the root directory', '.')
    .action(async ({ outdir, srcdir, rootdir }) => {
    const paths = [];
    await walkdirAsync(path_1.default.join(rootdir, srcdir), (pat, stat) => {
        if (stat.isFile()) {
            paths.push(path_1.default.normalize(pat));
        }
    });
    const tomls = [];
    for (const pat of paths) {
        if (path_1.default.extname(pat) == '.toml') {
            const buffer = await readFileAsync(pat);
            const result = rwtoml.fromString(buffer.toString());
            result.ok((toml) => tomls.push([pat, toml]));
            result.err((error) => {
                console.error(buffer.toString());
                console.error(error);
                process.exit(-3);
            });
        }
    }
    const result = (0, toml_1.build)({
        context: {
            sources: tomls.map(([pat, toml]) => {
                const pathr = path_1.default.relative(srcdir, pat).replace(/\.toml/, '').split(path_1.default.sep);
                return {
                    path: pathr,
                    content: toml,
                    from: (0, optional_1.none)(),
                    to: (0, optional_1.none)()
                };
            }),
            targets: [],
            into() {
                return {
                    sources: this.sources.map((x) => {
                        return {
                            path: x.path,
                            content: x.content,
                            from: (0, optional_1.none)(),
                            to: (0, optional_1.none)(),
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
            return [path_1.default.join(outdir, path_1.default.join(...x.path.map((v) => v)) + '.ini'), (() => {
                    let str = '';
                    for (const sec in x.content) {
                        str += `[${sec}]` + '\n';
                        for (const [key, value] of Object.entries(x.content[sec])) {
                            str += `${key}:${value}` + '\n';
                        }
                    }
                    return str;
                })()];
        })) {
            await (0, mkdirp_1.default)(path_1.default.dirname(pat));
            try {
                await writeFileAsync(pat, ini);
            }
            catch (error) {
                console.error(error);
                process.exit(-2);
            }
        }
    });
});
program.parse();
