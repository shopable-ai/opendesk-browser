'use strict';
const { validateTaskSpec, prepareTaskSpec, validateCandidate } = require('./TaskSpec');
const { inspectPage } = require('./ConfigExecutor');
const { FakeProvider, AdapterProvider } = require('./Provider');
const { generateTaskSpec, fetchRepresentativePages, discoverConfig, runFrozen, ConfigSpider, ScopedDownloader } = require('./Workflow');
const Processing = require('./Processing');
const BrowserValidation = require('./BrowserValidation');
module.exports = { engineFingerprint: require('./EngineFingerprint'), validateTaskSpec, prepareTaskSpec, generateTaskSpec, validateCandidate, inspectPage, FakeProvider, AdapterProvider, fetchRepresentativePages, discoverConfig, runFrozen, ConfigSpider, ScopedDownloader, Processing, BrowserValidation };
