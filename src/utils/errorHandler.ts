module.exports.MissingArgumentsErrror = class MissingArgumentsErrror extends Error {
    constructor(missing_args: string[]) {
        super(`MissingArguments: ${missing_args}`);
        this.name =   "MissingArgumentsErrror";
    }
}

module.exports.ProjectNotFoundErrror = class ProjectNotFoundErrror extends Error {
    constructor(missing_project: string) {
        super(`MissingProject: ${missing_project}`);
        this.name =   "ProjectNotFoundErrror";
    }
}