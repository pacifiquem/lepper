import path from "path";
import { fileURLToPath } from 'url';
import fs from "fs";
import Table from "cli-table";

const processDirectory = process.cwd();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const programPath = `${path.join(__dirname, "..")}`;

// function for initializing project
export const init = (
  projName: string,
  folders: string[],
  directory: string
) => {
  if (folders !== undefined && directory !== undefined) {
    // remove duplicates
    const folderNames = [...new Set(folders)];
    folderNames.forEach((name) => {
      fs.mkdirSync(path.join(directory, name));
      const createdFolderPath = path.join(directory, name);
    });
  }
};

// function for generating file or folder
export const generate = (files: string[], directory: string) => {
  if (files !== undefined && directory !== undefined) {
    // removing duplicates
    const fileNames = [...new Set(files)];
    fileNames.forEach((name) => {
      fs.writeFileSync(path.join(directory, `${name}.js`), "");
      const createdFilePath = path.join(directory, `${name}.js`);
    });
  }
};

// function for adding description to project or folder or even file
export const descriptionManager = (argument: {
  file?: string;
  message?: string;
  folder?: string;
  project?: string;
}) => {
  if (argument.hasOwnProperty("file") && argument.file !== undefined) {
    const fileName = argument.file;
    const filesInDirectory = fs.readdirSync(processDirectory);
    if (filesInDirectory.includes(fileName)) {
      fs.appendFile(
        `${programPath}/program-data/files.txt`,
        `${fileName} : ${argument.message} \n`,
        (err: Error | null) => {
          if (err) {
            console.log(err);
          } else {
            console.log(`Description of ${fileName} was saved.`);
          }
        }
      );
    } else {
      console.log(`File not found in this directory`);
    }
  }

  if (argument.hasOwnProperty("folder") && argument.folder !== undefined) {
    const folderName = argument.folder;
    const foldersInDirectory = fs.readdirSync(processDirectory);
    if (foldersInDirectory.includes(folderName)) {
      fs.appendFile(
        `${programPath}/program-data/folders.txt`,
        `${folderName} : ${argument.message} \n`,
        (err: Error | null) => {
          if (err) {
            console.log(err);
          } else {
            console.log(`Description of ${folderName} was saved.`);
          }
        }
      );
    } else {
      console.log(`Folder not found in this directory`);
    }
  }

  if (argument.hasOwnProperty("project") && argument.project !== undefined) {
    const projectName = argument.project;
    fs.appendFile(
      `${programPath}/program-data/projects.txt`,
      `${projectName} : ${argument.message} \n`,
      (err: Error | null) => {
        if (err) {
          console.log(err);
        } else {
          console.log(`Description of ${projectName} was saved.`);
        }
      }
    );
  }
};

// function for displaying description of project or folder or even file
export const descriptionDisplayer = (argument: {
  file?: string;
  folder?: string;
  project?: string;
}) => {
  if (argument.hasOwnProperty("file") && argument.file !== undefined) {
    const fileName = argument.file;
    const filesInDirectory = fs.readdirSync(processDirectory);

    if (filesInDirectory.includes(fileName)) {
      const table = new Table({
        head: ["Filename", "Description"],
        colWidths: [20, 100],
      });
      fs.readFile(
        `${programPath}/program-data/files.txt`,
        "utf8",
        (err: Error | null, data: string | Buffer) => {
          if (err) {
            console.error(err);
            return;
          }
          const filesData = JSON.parse(data.toString());
          const fileDescription = filesData[fileName].description;
          table.push([fileName, fileDescription]);
          console.log(table.toString());
        }
      );
    } else {
      console.log(`File ${fileName} not found in ${processDirectory}`);
    }
  } else if (
    argument.hasOwnProperty("folder") &&
    argument.folder !== undefined
  ) {
    const folderName = argument.folder;
    const foldersInDirectory = fs
      .readdirSync(processDirectory, { withFileTypes: true })
      .filter((dirent: fs.Dirent) => dirent.isDirectory())
      .map((dirent: fs.Dirent) => dirent.name);
    if (foldersInDirectory.includes(folderName)) {
      const table = new Table({
        head: ["Folder", "Description"],
        colWidths: [20, 100],
      });
      fs.readFile(
        `${programPath}/program-data/folders.txt`,
        "utf8",
        (err: Error | null, data: string | Buffer) => {
          if (err) {
            console.error(err);
            return;
          }
          const foldersData = JSON.parse(data.toString());
          const folderDescription = foldersData[folderName].description;
          table.push([folderName, folderDescription]);
          console.log(table.toString());
        }
      );
    } else {
      console.log(`Folder ${folderName} not found in ${processDirectory}`);
    }
  } else if (
    argument.hasOwnProperty("project") &&
    argument.project !== undefined
  ) {
    const projectName = argument.project;
    const projectsInDirectory = fs.readdirSync(
      `${programPath}/program-data/projects.txt`
    );
  } else if (
    argument.hasOwnProperty("project") &&
    argument.project !== undefined
  ) {
    const projectName = argument.project;
    const projectsInDirectory = fs.readdirSync(
      `${programPath}/program-data/projects.txt`
    );
    if (projectsInDirectory.includes(projectName)) {
      const table = new Table({
        head: ["Project", "Description"],
        colWidths: [20, 100],
      });
      fs.readFile(
        `${programPath}/program-data/projects.txt`,
        "utf8",
        (err: Error | null, data: string | Buffer) => {
          if (err) {
            console.error(err);
            return;
          }
          const projectData = JSON.parse(data.toString());
          const projectDescription = projectData.description;
          table.push([projectName, projectDescription]);
          console.log(table.toString());
        }
      );
    } else {
      console.log(
        `Project ${projectName} not found in ${programPath}/program-data/projects.txt`
      );
    }
  } else {
    console.log("Please provide either file, folder, or project as argument.");
  }
};
