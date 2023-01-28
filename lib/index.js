"use strict";
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
const rw_build_util_1 = require("rw-build-util");
const { build } = rw_build_util_1.tomlbuilder;
const { optional, some, none } = rw_build_util_1.opt;
const { ok, err } = rw_build_util_1.result;
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
