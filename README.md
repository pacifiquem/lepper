# npx-proj

### Installation

```js
    npm i -g npx-proj
```

### Usage

- #### Initializing project
```js
    npx-proj init <project-name> -fo <foldername>
    //you can add more than one folder name .
```
- #### Generating file or folder
```js
    npx-proj generate -fo <foldername> //for folder
    npx-proj generate <foldername> -fi <filename> //for files
```
- ### Adding discription to file or folder
```js
    npx-proj add-description -p <projectname>  -m "discription" //for projects
    npx-proj add-description -fo <foldername>  -m "discription" //for folders
    npx-proj add-description -fi <filename>  -m "discription" //for files
```
- #### Getting discription .
```js
    npx-proj describe -p <projectname> //for projects
    npx-proj describe -fo <foldername> //for folders
    npx-proj describe -fi <filename> //for files
