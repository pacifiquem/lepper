//packages
const path = require("path");
const fs = require('fs');
const process = require("process");
const Table = require('cli-table');
const processDirectory = process.cwd();
const programPath = `${path.join(__dirname, '..')}`;


//function for initializing project
export const init = (projName: string, folders: string[], directory: string) => {
    if (folders != undefined && directory != undefined) {

        //remove duplicates
        let folderNames = folders;
        folderNames = folderNames.filter((item, index) => folderNames.indexOf(item) === index);

        folderNames.map(name => {
            fs.mkdirSync(path.join(directory, name));
            let createdFolderPath = path.join(directory, name);
        });

    }
}

// function for generating file or folder
export const generate = (files: string[], directory: string) => {
    if (files != undefined && directory != undefined) {

        //removing duplicates
        let fileNames = files;
        fileNames = fileNames.filter((item, index) => fileNames.indexOf(item) === index);
        fileNames.map(name => {
            fs.writeFileSync(path.join(directory, `${name}.js`), '');
            let createdFilePath = path.join(directory, `${name}.js`);
        });

    }
}

//function for adding description to project or folder or even file
export const descriptionManager = (argument: { file: string, message: string, folder: string, project: string }) => {

    if (argument.hasOwnProperty('file')) {
        const fileName = argument.file;
        const filesInDirectory = fs.readdirSync(processDirectory);
        if (filesInDirectory.includes(fileName)) {
            fs.appendFile(`${programPath}/programm-data/files.txt`, `${fileName} : ${argument.message} \n`, (err: any) => {
                err ? console.log(err) : console.log(`description of ${fileName} was saved .`);
            });
        } else {
            console.log(`file not found in this directory`);
        }
    }

    if (argument.hasOwnProperty('folder')) {
        const folderName = argument.folder;
        const foldersInDirectory = fs.readdirSync(processDirectory);
        if (foldersInDirectory.includes(folderName)) {
            fs.appendFile(`${programPath}/programm-data/folders.txt`, `${folderName} : ${argument.message} \n`, (err: any) => {
                err ? console.log(err) : console.log(`description of ${folderName} was saved .`);
            });
        } else {
            console.log(`file not found in this directory`);
        }
    }

    if (argument.hasOwnProperty('project')) {
        const projectName = argument.project;
        fs.appendFile(`${programPath}/programm-data/projects.txt`, `${projectName} : ${argument.message} \n`, (err: any) => {
            err ? console.log(err) : console.log(`description of ${projectName} was saved .`);
        });
    }

}

//function for displaying description of project or folder or even file
export const descriptionDisplayer = (argument: any) => {
    if (argument.hasOwnProperty('file')) {
        const fileName = argument.file;
        const filesInDirectory = fs.readdirSync(processDirectory);
        if (filesInDirectory.includes(fileName)) {

            var table = new Table({
                head: ['Filename', 'Discription']
                , colWidths: [20, 100]
            });

            fs.readFile(`${programPath}/programm-data/files.txt`, 'utf8', (err: any, data: string) => {
                if (data != null && data != undefined) {
                    let arrayOfStrData = data.split('\n');
                    arrayOfStrData.map((str: any) => {
                        str = str.split(':');
                        str[1] = str[1].replace('\r', '');
                        if (str[0] === fileName) {
                            table.push(str);
                        }
                    });
                } else {
                    console.log(`description not found .`);
                }
            });

            setTimeout(() => {
                if (table.length > 0) {
                    console.log(table.toString());
                } else {
                    console.log(`file not found`);
                }
            }, 1000);

        } else {
            console.log(`file not found in this directory`);
        }
    }

    if (argument.hasOwnProperty('folder')) {
        const folderName = argument.folder;
        const foldersInDirectory = fs.readdirSync(processDirectory);

        if (foldersInDirectory.includes(folderName)) {

            var table = new Table({
                head: ['Foldername', 'Discription']
                , colWidths: [20, 100]
            });

            fs.readFile(`${programPath}/programm-data/folders.txt`, 'utf8', (err: any, data: string) => {
                if (data != null && data != undefined) {
                    let arrayOfStrData = data.split('\n');
                    arrayOfStrData.map((str: any) => {
                        str = str.split(':');
                        str[1] = str[1].replace('\r', '');
                        if (str[0] === folderName) {
                            table.push(str);
                        }
                    });
                } else {
                    console.log(`description not found .`);
                }
            });

            setTimeout(() => {
                if (table.length > 0) {
                    console.log(table.toString());
                } else {
                    console.log(`folder not found`);
                }
            }, 1000);

        } else {
            console.log(`folder not found in this directory`);
        }
    }


    if (argument.hasOwnProperty('project')) {

        const projectName = argument.project;

        var table = new Table({
            head: ['Foldername', 'Discription'],
            colWidths: [20, 100]
        });

        fs.readFile(`${programPath}/programm-data/projects.txt`, 'utf8', (err: any, data: string) => {
            if (data != null && data != undefined) {
                let arrayOfStrData = data.split('\n');
                arrayOfStrData.map((str: any) => {
                    str = str.split(':');
                    str[1] = str[1].replace('\r', '');
                    if (str[0] === projectName) {
                        table.push(str);
                    }
                });
            } else {
                console.log(`description not found .`);
            }
        });

        setTimeout(() => {
            if (table.length > 0) {
                console.log(table.toString());
            } else {
                console.log(`project not found`);
            }
        }, 1000);

    }
}