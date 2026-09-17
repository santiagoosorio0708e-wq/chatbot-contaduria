require('dotenv').config();

module.exports = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    BUSINESS_HOURS_START: process.env.BUSINESS_HOURS_START || '08:00',
    BUSINESS_HOURS_END: process.env.BUSINESS_HOURS_END || '18:00',
};
