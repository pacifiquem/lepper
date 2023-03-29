module.exports.MissingArgumentsErrror = class MissingArgumentsErrror extends Error {
    constructor(missing_args: string[]) {
        super(`MissingArguments: ${missing_args}`);
        this.name =   "MissingArgumentsError";
    }
}

module.exports.ProjectNotFoundErrror = class ProjectNotFoundErrror extends Error {
    constructor(missing_project: string) {
        super(`MissingProject: ${missing_project}`);
        this.name =   "ProjectNotFoundError";
    }
}

module.exports.FileNotFoundErrror = class FileNotFoundErrror extends Error {
    constructor(missing_file: string) {
        super(`MissingFile: ${missing_file}`);
        this.name =   "FileNotFoundError";
    }
}

module.exports.FolderNotFoundErrror = class FolderNotFoundErrror extends Error {
    constructor(missing_folder: string) {
        super(`MissingFolder: ${missing_folder}`);
        this.name =   "FolderNotFoundError";
    }
}