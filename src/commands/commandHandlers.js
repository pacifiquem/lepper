//packages
const path = require('path');
const fs = require('fs');

const processDirectory = process.cwd();


module.exports.init = (projName, folders, directory) => {
    if(folders != undefined && directory != undefined) {

        //remove duplicates
        let folderNames = folders;
        folderNames = folderNames.filter((item,index) => folderNames.indexOf(item) === index);

        folderNames.map(name => {
            fs.mkdirSync(path.join(directory, name));
            let createdFolderPath = path.join(directory, name);
        });

    }
}


module.exports.generate = (files, directory) => {
    if(files != undefined && directory != undefined) {

        //removing duplicates
        let fileNames = files;
        fileNames = fileNames.filter((item,index) => fileNames.indexOf(item) === index);
        fileNames.map(name => {
            fs.writeFileSync(path.join(directory, `${name}.js`), '');
            let createdFilePath = path.join(directory, `${name}.js`);
        });

    }
}

module.exports.descriptionManager = (argument) => {

    if(argument.hasOwnProperty('file')) {
        const fileName = argument.file;
        const filesInDirectory = fs.readdirSync(processDirectory);
        if(filesInDirectory.includes(fileName)) {
            fs.appendFile('./src/programm-data/folders.txt', `${fileName} : ${argument.message} \n`, (err) => {
                err ? console.log(err) : console.log(`description of ${fileName} was saved .`);
            });
        }else {
            console.log(`file not found in this directory`);
        }
    }

    if(argument.hasOwnProperty('folder')) {
        const folderName= argument.folder;
        const foldersInDirectory = fs.readdirSync(processDirectory);
        if(foldersInDirectory.includes(folderName)) {
            fs.appendFile('./src/programm-data/folders.txt', `${folderName} : ${argument.message} \n`, (err) => {
                err ? console.log(err) : console.log(`description of ${folderName} was saved .`);
            });
        }else {
            console.log(`file not found in this directory`);
        }
    }

    if(argument.hasOwnProperty('project')) {
        const projectName= argument.Project;
        fs.appendFile('./src/programm-data/projects.txt', `${projectName} : ${argument.message} \n`, (err) => {
            err ? console.log(err) : console.log(`description of ${projectName} was saved .`);
        });
    }

}
