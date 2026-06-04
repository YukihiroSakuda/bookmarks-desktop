export type MatchType = "starts_with" | "contains" | "ends_with";
export type TargetField = "title" | "url";

export interface TagRuleDB {
  id: string;
  match_type: MatchType;
  pattern: string;
  tag_id: string;
  target_field: TargetField;
  created_at: string;
  updated_at: string;
}

export interface TagRule {
  id: string;
  matchType: MatchType;
  pattern: string;
  tagId: string;
  targetField: TargetField;
  createdAt: string;
  updatedAt: string;
}

export interface TagRuleFormData {
  matchType: MatchType;
  pattern: string;
  tagId: string;
  targetField: TargetField;
}

export function convertTagRuleToUI(db: TagRuleDB): TagRule {
  return {
    id: db.id,
    matchType: db.match_type,
    pattern: db.pattern,
    tagId: db.tag_id,
    targetField: db.target_field,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}
