module.exports.MissingArgumentsErrror = class MissingArgumentsErrror extends Error {
    constructor(missing_args: string) {
        super(`MissingArguments ${missing_args}`);
        this.name =   "MissingArgumentsErrror";
    }
}