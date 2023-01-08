//packages
const path = require('path');
const fs = require('fs');


module.exports.init = (folders, directory) => {
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
