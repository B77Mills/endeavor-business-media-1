const { getAsArray } = require('@base-cms/object-path');
const allPublishedContentQuery = require('./queries/content');
const websiteSectionsQuery = require('./queries/sections');
const { retrieveSectionsByIds } = require('../utils/retrieve-sections-by-ids');
const { downloadImages, zipItUp, uploadToS3 } = require('../utils/image-handler');
const { retrieveCompanies } = require('../utils/retrieve-companies');
const { formatText } = require('../utils/format-text');
const { channelSectionIds } = require('../id-vars');

const exportName = `export-${Date.now()}.zip`;
const companyLogos = [];

const mapHierarchy = (sections, companies) => sections.reduce((arr, section) => {
  const childNodes = getAsArray(section, 'children.edges').map(({ node }) => node);
  const children = childNodes.length ? mapHierarchy(childNodes, companies) : [];
  return [
    ...arr,
    {
      ...section,
      children,
      content: companies
        .filter(({ sectionIds }) => sectionIds.includes(section.id)),
    },
  ];
}, []).sort((a, b) => a.fullName.localeCompare(b.fullName));

module.exports = async ({ apollo }) => {
  // This will return the section for amt
  const sections = await retrieveSectionsByIds(apollo, websiteSectionsQuery, channelSectionIds);

  // Get all companies scheduled to the site
  const companies = await retrieveCompanies(apollo, allPublishedContentQuery);
  companies.sort((a, b) => a.name.localeCompare(b.name));

  // // Get the sections and map companies into them
  const segments = await mapHierarchy(sections, companies);

  // Wrap content in paragraph style
  const printContent = arr => arr.map((c) => {
    const text = [];
    text.push(`<ParaStyle:cName>${formatText(c.name)}`);
    return text.join('\n');
  });

  // The big kahuna. Loop over Sections and content into the accumulator (arr)
  const printSection = (arr, {
    name,
    fullName,
    children,
    content,
  }) => {
    const level = ((fullName.match(/ > /g) || []).length > 0)
      ? 'SubCategory'
      : 'MainCategory';

    return [
      ...arr,
      // Only include categories if they have content or children
      ...(content.length || children.length ? [
        `<ParaStyle:c${level}>${name}`,
        ...(level === 'MainCategory' ? '' : printContent(content)),
        ...children.reduce(printSection, []),
      ] : []),
    ];
  };

  const lines = [
    '<ASCII-MAC>', // @todo detect and/or make query a param
    ...segments.reduce(printSection, []),
  ];
  const cleanLines = lines.filter(e => e);
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
  return cleanLines.join('\n');
};
