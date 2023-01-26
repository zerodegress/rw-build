"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const walkdir_1 = __importDefault(require("walkdir"));
const toml_1 = __importDefault(require("toml"));
const mkdirp_1 = __importDefault(require("mkdirp"));
const commander_1 = require("commander");
const rw_toml_1 = require("rw-toml");
const config_1 = require("rw-toml/lib/config");
const result_1 = require("rw-toml/lib/result");
const builder_1 = require("rw-toml/lib/builder");
const program = new commander_1.Command();
function readFileAsync(path) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => fs_1.default.readFile(path, (error, data) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(data);
            }
        }));
    });
}
function writeFileAsync(file, data) {
    return __awaiter(this, void 0, void 0, function* () {
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
    });
}
function walkdirAsync(path, callback) {
    return __awaiter(this, void 0, void 0, function* () {
        const paths = yield walkdir_1.default.sync(path, callback);
        return paths;
    });
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
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    const rootdir = options.rootdir;
    const outputdir = options.outputdir;
    const sourcedir = options.sourcedir;
    try {
        let promises = [];
        let sources = [];
        const paths = yield walkdirAsync(path_1.default.join(rootdir, sourcedir), (pat, stat) => __awaiter(void 0, void 0, void 0, function* () {
            if (stat.isFile()) {
                promises.push([pat, readFileAsync(pat)]);
            }
        }));
        for (const [pat, pro] of promises) {
            try {
                const data = yield pro;
                if (pat.endsWith('.toml')) {
                    const tom = toml_1.default.parse(data.toString());
                    if ((0, config_1.implCommonToml)(tom)) {
                        sources.push(rw_toml_1.ClassicSource.toml(path_1.default.basename(pat), path_1.default.relative(path_1.default.join(rootdir, sourcedir), path_1.default.dirname(pat)), path_1.default.relative(path_1.default.join(rootdir, sourcedir), pat), tom));
                    }
                    else {
                        throw (0, result_1.err)(new Error(`${pat} is not a CommonToml File`));
                    }
                }
            }
            catch (error) {
                if (error instanceof Error) {
                    throw (0, result_1.err)(error);
                }
                else {
                    throw error;
                }
            }
        }
        new builder_1.ClassicBuilderSync(rootdir, sourcedir, outputdir, sources).buildAllSync().ok((targets) => __awaiter(void 0, void 0, void 0, function* () {
            for (const target of targets) {
                if (target.targetFile.type == builder_1.ClassicTargetFileType.INI) {
                    let ini = '';
                    const content = target.targetFile.content;
                    for (const sec in content) {
                        ini += `[${sec}]` + '\n';
                        for (const key in content[sec]) {
                            const value = content[sec][key];
                            if (value.includes(os_1.default.EOL) || value.includes('\n')) {
                                ini += key + ':"""' + value + '"""\n';
                            }
                            else {
                                ini += key + ':' + value + '\n';
                            }
                        }
                    }
                    yield (0, mkdirp_1.default)(path_1.default.join(rootdir, outputdir, target.dirname));
                    yield writeFileAsync(path_1.default.join(rootdir, outputdir, target.dirname, target.filename), ini);
                }
            }
        })).err((error) => { throw (0, result_1.err)(error); });
    }
    catch (result) {
        if (result instanceof result_1.Result) {
            result.err((error) => {
                console.error(error);
            });
        }
        else {
            throw result;
        }
    }
}));
program.parse();
