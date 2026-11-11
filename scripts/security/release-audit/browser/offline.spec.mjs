import {test} from 'playwright/test';
import {setup,scenarios} from './scenarios.mjs';
test.beforeEach(setup);
for(const {id,run} of scenarios)test(id,run);
