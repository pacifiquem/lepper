# npx-proj

![npm](https://img.shields.io/npm/v/npx-proj.svg?style=flat-square)
![NPM Downloads](https://img.shields.io/npm/dw/npx-proj?style=flat-square)

project structure manager .

## Installation

```bash
    npm i -g npx-proj
```

## Usage

- ### Initializing project

```bash
    npx-proj init <project-name> -fo <list of folders>
    //you can add more than one folder name .
```

- ### Generating file or folder

```bash
    npx-proj generate <foldername> -fi <filename> //for files
```

- ### Adding discription to file or folder

```bash
    npx-proj add-description -p <projectname>  -m "discription" //for projects
    npx-proj add-description -fo <foldername>  -m "discription" //for folders
    npx-proj add-description -fi <filename>  -m "discription" //for files
```

- ### Getting discription

```bash
    npx-proj describe -p <projectname> //for projects
    npx-proj describe -fo <foldername> //for folders
    npx-proj describe -fi <filename> //for files
```

## Advantages of using npx-proj

- Initializing projects easier with ordered folders .
- Makes generating files easier .
- Saving discription of projects, folders and files you've created .

## Contribution

 Refer to [Contributing.md](https://github.com/pacifiquem/npx-proj/blob/main/CONTRIBUTING.md).

## Security

Refer to [Security.md](https://github.com/pacifiquem/npx-proj/blob/main/SECURITY.md).

## Support

- I'd really appreciate it if you'd leave a star on [the repo](https://github.com/pacifiquem) .
- you can also [Buy me a coffe](https://buymeacoffee.com/pacifiquem) 😋 .
