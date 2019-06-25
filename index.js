const fs = require('fs');
const path = require('path')
const _ = require('lodash');
const AWS = require('aws-sdk');
const h2p = require('html2plaintext')
const moment = require('moment');
AWS.config.loadFromPath('./config.json');
const docClient = new AWS.DynamoDB.DocumentClient();

const todayDate = moment().format('YYYY-MM-DD');
const getMostRecentFileName = (dir) => {
    try {
        const files = fs.readdirSync(dir);
        return _.maxBy(files, function (f) {
            var fullpath = path.join(dir, f);
            return fs.statSync(fullpath).ctime;
        });
    } catch (err) {
        throw Error('Today directory doesnt exist')
    }
}
const datedirname = `${todayDate}`;
const dirpath = `./${datedirname}/`
const htmlfilepath = fs.readFileSync(dirpath + getMostRecentFileName(dirpath))

exports.handler = async (event) => {

    const splitNewLine = line => line.split("\n").map(_.trim);
    const splitNumber = line => line.split(new RegExp(' [0-9]\. ')).map(_.trim);
    // this is important that every proper line starts with "digit/s dot space"
    const startWithNumber = line => line.match(/^[0-9]+\. /)
    const arr = _.flatMap(_.flatMap(h2p(htmlfilepath).split(new RegExp('[0-9]{1,2}[:]?[0-9]{1,2} [A-Z]{2}')), splitNewLine), splitNumber);

    // console.log(arr)
    const incidentIds = arr.reduce((result, line) => {
            // console.log(line, line.includes('Incident_Id'));
            if (line.includes('Incident_Id')) {
                // console.log(line);
                if (!line.match(/^[0-9]+\. /)) {
                    line = '1. ' + line;
                }
                result.push([line]);
            } else {
                if (result.length) {
                    result[result.length - 1].push(line);
                }
            }
            return result;
        }, []).map(incident => incident.filter(startWithNumber))
        .map(incident => {
            return incident.reduce((obj, line) => {
                // this is important, every key value pair must be separated by hyphen space
                const parts = line.replace(/^[0-9]+\. /, '').split(new RegExp('[–-] '));

                return {
                    ...obj,
                    [(parts[0] || '').trim()]: (parts[1] || 'abc').trim()
                };
            }, {});
        });

    console.log(incidentIds);

    await Promise.all(Object.keys(incidentIds).map(i => {
        return writeondynamo(incidentIds[i])
    })).then(d => {
        // console.log(d)
    }).catch(err => {
        console.log(err)
    });

    return 'DONE'
}

exports.handler().then(console.log);

function writeondynamo(incident) {
    // return new Promise((resolve, reject) => {
    let params = {
        TableName: 'Incidents',
        Item: incident
    };
    // console.log(JSON.stringify(params));
    // console.log(incident);
    return docClient.put(params).promise();
    // })
}