#!/usr/bin/env node
const process = require('process')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const generate = require('babel-generator').default
require('colors')

function isValidIdentifier(string) {
    const regexIdentifierName
        = /^(?:[$_\p{ID_Start}])(?:[$_\u200C\u200D\p{ID_Continue}])*$/u
    return Boolean(regexIdentifierName.exec(string))
}

function defaultConvert(filename) {
    return path.parse(filename).name
        .replace(/\s+/, '')
        .replace(/-([a-zA-Z])/g, (_, char) => char.toUpperCase())
}

function defaultIgnore(filename, outFile) {
    return filename.includes('/')
        || filename.startsWith('--')
        || filename.startsWith('.')
        || path.parse(filename).ext === ''
}

function defaultOutFile(directory) {
    return `./${ path.format(path.parse(directory)) }/index.js`
}

function* files(directory) {
    for (const fileName of fs.readdirSync(directory)) {
        const fullName = path.join(directory, fileName)
        const fileStat = fs.statSync(fullName)
        if (fileStat.isFile()) {
            yield fullName
        }
    }
}

function folderModule(directory, options={}) {
    const outFile = typeof options.outFile === 'string'
        ? options.outFile
        : defaultOutFile(directory)
    const convertFilename = 'convert' in options
        ? options.convert
        : defaultConvert
    const ignore = 'ignore' in options
        ? options.ignore
        : defaultIgnore

    // Get rid of files that need to be ignored
    const inFiles = [...files(directory)]
        .filter(fileName => !ignore(path.basename(fileName, outFile)))

    // Convert all filenames into
    const mappings = inFiles
        .map(fileName => ({
            fileName,
            varName: convertFilename(path.basename(fileName))
        }))

    // If there's a duplicate out name throw an error
    const seen = new Map()
    mappings
        .forEach(({ fileName, varName }) => {
            if (!isValidIdentifier(varName)) {
                throw new Error(`Var name ${ varName } isn't a valid variable name (${ fileName })`)
            }

            if (seen.has(varName)) {
                throw new Error(`Var name ${ varName } is generated by both ${ fileName } and ${ seen.get(varName) }`)
            }
            seen.set(varName, fileName)
        })

    const exportNodes = mappings
        .map(({ varName, fileName }) => ({
            type: 'ExportNamedDeclaration',
            specifiers: [{
                type: 'ExportSpecifier',
                local: {
                    type: "Identifier",
                    name: 'default',
                },
                exported: {
                    type: 'Identifier',
                    name: varName,
                },
            }],
            source: {
                type: 'StringLiteral',
                value: `./${ path.relative(path.dirname(outFile), fileName) }`,
            }
        }))

    const string = exportNodes
        .map(generate)
        .map(({ code }) => code)
        .join('\n')

    mkdirp.sync(path.dirname(outFile))
    fs.writeFileSync(outFile, `${ string }\n`)
}

module.exports = folderModule

if (require.main === module) {
    const inputDirectory = process.argv[2]
    if (inputDirectory == null) {
        throw new Error(`Input directory must be specified`)
    }

    try {
        folderModule(inputDirectory, {
            outFile: process.argv[3]
        })
    } catch (err) {
        console.log(err.message.red)
    }
}
