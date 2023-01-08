//packages
const path = require('path');
const fs = require('fs');


module.exports.init = (folders, directory) => {
    if(folders != undefined && directory != undefined) {
        let folderNames = folders;
        folderNames.map(name => {
            fs.mkdirSync(path.join(directory, name));
            let createdFolderPath = path.join(directory, name);
        });
    }
}


module.exports.generate = (files, directory) => {
    if(files != undefined && directory != undefined) {
        let fileNames = files;
        fileNames.map(name => {
            fs.writeFileSync(path.join(directory, `${name}.js`), '');
            let createdFilePath = path.join(directory, `${name}.js`);
        });
    }
}
