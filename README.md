# rw-build
rw-build is a CLI tool for Rusted Warfare modding build.

## Installation
npm is avaliable via npm.
```
npm install -g rw-build
```

## Example
The version of rwbuild in this example is 2.0.0
### Source Code
```toml
#src/example.toml
[core]
name = "test_builder"
class = "CustomUnitMetadata"
price = 100
defineUnitMemory = [
    "string str",
    "number num"
]
displayDescription = '''
    some multiline
    text
'''

[canBuild]
main = { name = ["setRally", "tank"], pos = 0 }

[turret.left]
x = -5
y = 0

[turret]
right = { x = 5, y = 0 }
#some not important code not shown
```
### Use rwbuild
In the '.' directory
```shell
$ rwbuild build
```
### Generated Code
```ini
#build/example.ini
[core]
name:test_builder
class:CustomUnitMetadata
price:100
defineUnitMemory:string str,number num
displayDescription:"""    some multiline
    text
"""
[canBuild_main]
name:setRally,tank
pos:0
[turret_left]
x:-5
y:0
[turret_right]
x:5
y:0
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
> - --outdir <outdir>  locate the output directory (default: "build")
> - --srcdir <srcdir>  locate the source directory (default: "src")
> - --rootdir <rootdir>      locate the root directory (default: ".")
> - -h, --help                   display help for command
- help [command]   display help for command

## Currently to be completed
- [ ] change default nextline.(Now is \n)
- [ ] dependencies & assets import support.(Now the [core]copyFrom and [graphics]image can not be build correctly because of ignoring the dependencies)
- [ ] converter support, used to convert toml files before it is built to ini files.
- [ ] config file support, used to write complex configs.It can define simple converter.
- [ ] script support, used to write complex converter.

## License
rw-toml is licensed under the GNU-GPL v3 license agreement. See the LICENSE file for more information.