# npx-proj
![npm](https://img.shields.io/npm/v/npx-proj.svg?style=flat-square)
![NPM Downloads](https://img.shields.io/npm/dw/npx-proj?style=flat-square)
<br>

project structure manager .

# Installation

```js
    npm i -g npx-proj
```

# Usage

- #### Initializing project
```js
    npx-proj init <project-name> -fo <list of folders>
    //you can add more than one folder name .
```
- #### Generating file or folder
```js
    npx-proj generate <foldername> -fi <filename> //for files
```
- ### Adding description to file or folder
```js
    npx-proj add-description -p <projectname>  -m "description" //for projects
    npx-proj add-description -fo <foldername>  -m "description" //for folders
    npx-proj add-description -fi <filename>  -m "description" //for files
```
- #### Getting description .
```js
    npx-proj describe -p <projectname> //for projects
    npx-proj describe -fo <foldername> //for folders
    npx-proj describe -fi <filename> //for files
```

# Advantages of using npx-proj

- Initializing projects easier with ordered folders .
- Makes generating files easier .
- Saving description of projects, folders and files you've created .

# Contribution
 
 You are free to fork and modify [this project](https://github.com/pacifiquem) to you liking .

 # Support

  - I'd really appreciate it if you'd leave a star on [the repo](https://github.com/pacifiquem) .
  - you can also [Buy me a coffe](https://buymeacoffee.com/pacifiquem) 😋 .
  
  # copyright
  
  Copyright [@pacifiquem](https://github.com/pacifiquem) 2023 - Present .

