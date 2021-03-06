// const { sgetAsArray } = require('@base-cms/object-path');
const allPublishedContentQuery = require('./queries/content');
const websiteSectionsQuery = require('./queries/sections');
const { replaceCharacters } = require('../utils/replace-characters');
const { retrieveCompanies } = require('../utils/retrieve-companies');
const { retrieveRootSection } = require('../utils/retrieve-root-section');
const { retrieveFilterdCompanies } = require('../utils/retrieve-filtered-companies');

module.exports = async ({ apollo }) => {
  // This will return the direct decents of the /directory section.
  const rootSection = await retrieveRootSection(apollo, websiteSectionsQuery, 'distributor-directory');
  // Get all companies scheduled to the site after Feb. 15 2018
  // Date is set in retrieveCompanies function
  const allCompanies = await retrieveCompanies(apollo, allPublishedContentQuery);
  // Filter companies to only ones scheduled to /directory or below
  const companies = retrieveFilterdCompanies(allCompanies, rootSection);
  // Sort them alpha numerically
  companies.sort((a, b) => a.name.localeCompare(b.name));

  const lines = [['id', 'ComapnyName', 'email', 'publicEmail', 'state', 'country']];

  companies.forEach((c) => {
    lines.push([c.id, replaceCharacters(c.name, ',', ''), c.email, c.publicEmail, c.state, c.country]);
  });

  // @todo port special character filter from php
  return lines.join('\n');
};
