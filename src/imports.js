// Everything the plugin takes from Obsidian and CodeMirror (provided by Obsidian at run time, nothing bundled).
const { Plugin, PluginSettingTab, Setting, AbstractInputSuggest, TFile, Platform, Keymap, debounce, normalizePath, editorInfoField } = require('obsidian');
const { ViewPlugin, Decoration } = require('@codemirror/view');
const { RangeSetBuilder, StateEffect } = require('@codemirror/state');
