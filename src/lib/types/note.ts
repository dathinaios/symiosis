export interface NoteMetadata {
  filename: string
  modified: number
}

export interface NoteVersion {
  filename: string
  backup_type: string
  timestamp: number
  size: number
  formatted_time: string
}

export interface DeletedFile {
  filename: string
  backup_filename: string
  deleted_at: string
  timestamp: number
}
