const axios = require("axios");
const cheerio = require("cheerio");

const fs = require("fs");
const util = require("util");
const semlog = require("semlog");

const readFile = util.promisify(fs.readFile);
const { log } = semlog;

/**
 * Checks if title is longer than 240 bytes required by MediaWiki
 * 225 = 240 - 15 for id and extension
 * @param {string} title
 */
function isTitleTooLong(title) {
  return new util.TextEncoder("utf-8").encode(title).length > 225;
}

function shortenTitle(title) {
  const newTitle = `${title.substring(0, title.lastIndexOf(" "))}...`;
  return isTitleTooLong(newTitle) ? shortenTitle(newTitle) : newTitle;
}

/**
 * Removes chars forbidden in MediaWiki file title
 * @param {string} title
 */
function convertToMediaWikiTitle(title) {
  const escapedTitle = title
    .replace(/[\[\]{}\|#<>%\+\?]/gi, "") // eslint-disable-line no-useless-escape
    .replace(/( : |: | = )/g, " - ")
    .replace(/:/g, "-");
  return isTitleTooLong(escapedTitle)
    ? shortenTitle(escapedTitle)
    : escapedTitle;
}

/**
 * Takes data from Polona endpoint and retuens object with data
 * @param {string} identifier Polona identifier
 */
async function fetchData(identifier) {
  const selectorPrefix = "#content > div:nth-child(3) > div.big_box_content > ";

  return new Promise(resolve => {
    log(`Fetching ${identifier}...`);

    axios
      .get(`https://audiovis.nac.gov.pl/obraz/${identifier}/`)
      .then(response => {
        const { data } = response;
        const $ = cheerio.load(data);

        const file = $(`${selectorPrefix} div.photo > a > img`)
          .attr("src")
          .trim()
          .replace("SM0/SM0_", "PIC/PIC_");

        const title = $(`${selectorPrefix} div:nth-child(1)`)
          .text()
          .trim()
          .substring(14);

        const photographer = $(`${selectorPrefix} div:nth-child(11)`)
          .text()
          .trim()
          .substring(7);

        const description = $(`${selectorPrefix} div:nth-child(3)`)
          .text()
          .trim()
          .substring(13);

        const depicted_people = $(`${selectorPrefix} div:nth-child(6)`)
          .text()
          .trim()
          .substring(16)
          .split(",")
          .map(e => e.trim())
          .filter(e => e)
          .join(", ");

        const depicted_place = $(`${selectorPrefix} div:nth-child(5)`)
          .text()
          .trim()
          .substring(10);

        const date = $(`${selectorPrefix} div:nth-child(4)`)
          .text()
          .trim()
          .substring(17);

        let institution = $(`${selectorPrefix} div:nth-child(12) > a`)
          .text()
          .trim();
        institution = institution.substring(institution.indexOf(":") + 1);

        const accession_number = $(`${selectorPrefix} div:nth-child(13)`)
          .text()
          .trim()
          .substring(11);

        const name = `${convertToMediaWikiTitle(
          title
        )} (${accession_number}).jpg`;

        resolve({
          file,
          name,
          photographer,
          description,
          depicted_people,
          depicted_place,
          date,
          institution,
          accession_number,
          identifier
        });
      })
      .catch(err => {
        log(`error! ${err}`);
        resolve({});
      });
  });
}

/**
 * Reads input file
 * @param {string} fileName
 */
async function readInputFile(fileName) {
  const data = await readFile(fileName, "utf8");
  return data.split(/\n/).filter(value => value);
}

function wikify(data) {
  return `=={{int:filedesc}}==
{{Photograph
 | photographer = ${data.photographer || "{{unknown photographer}}"}
 | medium = {{technique|photo}}
 | description = {{pl|${data.description}}}
 | depicted people = ${data.depicted_people || ""}
 | depicted place = ${data.depicted_place || ""}
 | date = ${data.date}
 | institution = {{Institution:Narodowe Archiwum Cyfrowe}}\n${data.institution}
 | accession number = ${data.accession_number}
 | source = https://audiovis.nac.gov.pl/obraz/${data.identifier}/
 | notes = 
 | inscriptions = 
}}

=={{int:license-header}}==
{{PD-old-auto}}
{{Narodowe Archiwum Cyfrowe partnership}}
  
{{Uncategorized-NAC|year={{subst:CURRENTYEAR}}|month={{subst:CURRENTMONTHNAME}}|day={{subst:CURRENTDAY}}}}`;
}

module.exports = { fetchData, log, readInputFile, wikify };
