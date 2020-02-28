const allPublishedContentQuery = require('./queries/content');
const websiteSectionsQuery = require('./queries/sections');
const { downloadImages, zipItUp, uploadToS3 } = require('../utils/image-handler');
const { retrieveCompanies } = require('../utils/retrieve-companies');
const { retrieveRootSection } = require('../utils/retrieve-root-section');
const { retrieveFilterdCompanies } = require('../utils/retrieve-filtered-companies');

const exportName = `export-${Date.now()}.zip`;
const companyLogos = [];

module.exports = async ({ apollo }) => {
  const rootSection = await retrieveRootSection(apollo, websiteSectionsQuery, 'directory');
  const allCompanies = await retrieveCompanies(apollo, allPublishedContentQuery);
  const companies = retrieveFilterdCompanies(allCompanies, rootSection);

  companies.sort((a, b) => a.name.localeCompare(b.name));
  const formatAddress = (c, appendedStyleText) => {
    const address = [];
    let streetLoc = '';
    if (c.address1) streetLoc += `<ParaStyle:DirCoAddress${appendedStyleText}>${c.address1}`;
    if (c.address2) streetLoc += `${c.address2}`;
    if (streetLoc !== '') address.push(streetLoc);
    let cityStateZip = '';
    if (c.city) cityStateZip += `<ParaStyle:DirCoAddress${appendedStyleText}>${c.city}`;
    if (c.state) cityStateZip += `, ${c.state}`;
    if (c.postalCode) cityStateZip += `, ${c.postalCode}`;
    if (c.country) cityStateZip += ` ${c.country}`;
    if (cityStateZip !== '') address.push(cityStateZip);
    return address;
  };

  const getTaxonomyIds = taxonomy => taxonomy.map(t => t.node.id);

  // Wrap content in paragraph style
  const printContent = arr => arr.map((c) => {
    const text = [];
    const taxonomyIds = getTaxonomyIds(c.taxonomy.edges);
    let appendedStyleText = '';
    // if the Directory Export: Logo Bin is set
    if (taxonomyIds.includes(2024375)) {
      appendedStyleText = `${appendedStyleText}Logo`;
    }
    // if the Directory Export: Ad Bin is set
    if (taxonomyIds.includes(2024376)) {
      appendedStyleText = `${appendedStyleText}Ad`;
    }
    if (appendedStyleText !== '') text.push('<ParaStyle:WhiteSpaceStart>');
    if (taxonomyIds.includes(2024375) && c.primaryImage !== null) {
      text.push(`<ParaStyle:${appendedStyleText}>${c.primaryImage.source.name}`);
      const imgPath = `https://cdn.baseplatform.io/${c.primaryImage.filePath}/${c.primaryImage.source.name}`;
      if (!companyLogos.includes(imgPath)) companyLogos.push(imgPath);
    }
    text.push(`<ParaStyle:DirCoName${appendedStyleText}>${c.name}`);
    const address = formatAddress(c, appendedStyleText);
    if (address.length > 0) address.forEach(companyAddress => text.push(companyAddress));
    if (c.phone) text.push(`<ParaStyle:DirCoPhone${appendedStyleText}>PH: ${c.phone}`);
    if (c.website) text.push(`<ParaStyle:DirCoWebsite${appendedStyleText}>${c.website.replace('https://', '').replace('http://', '')}`);
    if (appendedStyleText !== '') text.push('<ParaStyle:WhiteSpaceEnd>');
    return text.join('\n');
  });

  const lines = [
    '<ASCII-MAC>', // @todo detect and/or make query a param
    ...printContent(companies),
  ];


  if (companyLogos.length !== 0) {
    const tmpDir = `${__dirname}/tmp`;
    // Tempararly download all logs for zipping up.
    await downloadImages(`${tmpDir}/images`, companyLogos);
    // Zip up all logos required for export
    await zipItUp(`${tmpDir}/images`, tmpDir, exportName);
    // push a tmp zip file of image to the S3 server
    uploadToS3('base-cms-exports', 'exports', `${tmpDir}/${exportName}`);

    lines.push(`<ParaStyel:LogoDownloadPath>https://base-cms-exports.s3.amazonaws.com/exports/${exportName}`);
  }

  // @todo port special character filter from php
  return lines.join('\n');
};
