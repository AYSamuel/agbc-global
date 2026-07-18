import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import agbcBase from '@agbc/eslint-config/base';

export default defineConfig([...agbcBase, prettier]);
