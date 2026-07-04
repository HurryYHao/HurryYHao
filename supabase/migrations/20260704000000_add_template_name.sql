-- Add room_type and template_name columns to live_sessions table
ALTER TABLE live_sessions 
ADD COLUMN IF NOT EXISTS room_type varchar(20),
ADD COLUMN IF NOT EXISTS template_name varchar(255);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS live_sessions_room_type_idx ON live_sessions(room_type);
CREATE INDEX IF NOT EXISTS live_sessions_template_name_idx ON live_sessions(template_name);

-- Add template_name and room_type columns to analysis_reports table
ALTER TABLE analysis_reports 
ADD COLUMN IF NOT EXISTS template_name varchar(255),
ADD COLUMN IF NOT EXISTS room_type varchar(20);

-- Add index for template_name
CREATE INDEX IF NOT EXISTS analysis_reports_template_name_idx ON analysis_reports(template_name);
