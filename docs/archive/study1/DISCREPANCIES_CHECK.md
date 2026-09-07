# Discrepancies Check Report

## ✅ Verified - No Critical Issues Found

### 1. **Topic Data Format** ✅
- **Backend returns**: `stimulusText` (from `stimulus_text` in DB)
- **Frontend expects**: `stimulusText` (with fallback to `description`)
- **Status**: ✅ Compatible - Frontend handles both formats

### 2. **User Data Format** ✅
- **Backend returns**: 
  - `assignedAgentId` (number)
  - `currentTopicIndex` (number)
  - `hasCompletedLiteracySurvey` (boolean)
- **Frontend expects**: Same fields (optional in types, but always present in API)
- **Status**: ✅ Compatible

### 3. **Agent Data Format** ✅
- **Backend returns**:
  - `id` (number)
  - `name` (string)
  - `emotionalIntelligence` (number)
  - `cognitiveIntelligence` (number)
- **Frontend expects**: Same fields (with optional `description`)
- **Status**: ✅ Compatible - Frontend handles missing description

### 4. **Message Format** ✅
- **Backend returns**:
  - `id` (string/UUID)
  - `content` (string)
  - `role` ('user' | 'agent')
  - `timestamp` (ISO string)
- **Frontend expects**: Same format (converts timestamp string to Date)
- **Status**: ✅ Compatible

### 5. **Topic Policy Text** ⚠️ Minor
- **Backend**: Does NOT expose `topic_specific_policy` to frontend (only used in system prompts)
- **Frontend**: Uses `policyText` in PolicyPanel with fallback message
- **Status**: ⚠️ Expected behavior - policies are backend-only for security

### 6. **Survey Response Format** ✅
- **Backend expects**: 
  - Literacy: `{ questionId: string, value: number | string }[]`
  - Post-topic: `{ questionId: string, value: number }[]` (1-7, exactly 16)
- **Frontend sends**: Same format
- **Status**: ✅ Compatible

## Minor Observations

### 1. **Mock Data Still Present**
- `src/data/mockData.ts` still contains old topic data
- **Impact**: None - Not used when API is connected
- **Recommendation**: Can be removed or kept for reference

### 2. **Topic Description Field**
- Frontend components check for both `stimulusText` and `description`
- **Status**: ✅ Safe - Has fallback logic

### 3. **Agent Description**
- Frontend shows intelligence levels if description is missing
- **Status**: ✅ Good UX - Handles missing data gracefully

## Recommendations

1. ✅ **No action needed** - All critical data formats match
2. ⚠️ **Optional**: Remove or update mock data file (not critical)
3. ✅ **Current implementation is correct** - Topic policies intentionally not exposed

## Test Checklist

- [x] User registration returns correct format
- [x] User login returns correct format  
- [x] Topics API returns `stimulusText`
- [x] Agent data includes intelligence levels
- [x] Messages convert timestamp correctly
- [x] Survey submission format matches
- [x] Frontend handles missing optional fields

## Conclusion

**No critical discrepancies found.** The frontend and backend are properly aligned. All data formats match, and the frontend has appropriate fallbacks for optional fields.
