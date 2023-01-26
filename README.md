# rw-build
rw-build is a CLI tool for Rusted Warfare modding build.

## Installation
npm is avaliable via npm.
```
npm install -g rw-build
```

## Usage
```
rwbuild rw-build [options] [command]
```

Options:
-  -V, --version    output the version number
-  -h, --help       display help for command

Commands:
- build [options]  build the mod from source
> Options:
> - -r, --rootdir <rootdir>      locates the root directory for source and output (default: ".")
> - -o, --outputdir <outputdir>  locates the output directory for output (default: "dist")
> - -s, --sourcedir <sourcedir>  locates the source directory (default: "src")
> - -h, --help                   display help for command
- help [command]   display help for command

## License
rw-toml is licensed under the GNU-GPL v3 license agreement. See the LICENSE file for more information.