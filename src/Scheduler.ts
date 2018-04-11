import * as schedule from 'node-schedule';
import { SearchScheduler } from './config';

export default class Scheduler {
    constructor() {
    }

    public schedule(searchSchedulerConfig: SearchScheduler, job) {
        let rule = new schedule.RecurrenceRule();
        rule.dayOfWeek = searchSchedulerConfig.dayOfWeek;
        rule.hour = searchSchedulerConfig.hour;
        rule.minute = searchSchedulerConfig.minute;
        console.log(`Scheduled job for days: ${searchSchedulerConfig.dayOfWeek}, hour: ${searchSchedulerConfig.hour}, minute: ${searchSchedulerConfig.minute}`);
        schedule.scheduleJob(rule, job);
    }
}