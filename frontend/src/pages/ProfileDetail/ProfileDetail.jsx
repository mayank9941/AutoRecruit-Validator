import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import GlassCard from "../../components/GlassCard/GlassCard";
import Button from "../../components/Button/Button";
import Input from "../../components/Input/Input";
import { useJobProfile, useAddCriterion, useUpdateCriterion, useDeleteCriterion } from "../../hooks/useJobProfile";
import "./ProfileDetail.css";

const CRITERION_TYPES = ["education", "experience", "skill", "age", "other"];

export default function ProfileDetail() {
  const { profileId } = useParams();
  const { data: profile, isLoading, isError, error } = useJobProfile(profileId);

  if (isLoading) return <p className="text-soft">Loading profile…</p>;
  if (isError) return <p className="upload-error">Couldn't load this profile: {error.detail || error.message}</p>;

  return (
    <div className="profile-detail">
      <Link to="/profiles" className="back-link">
        ← All Job Profiles
      </Link>

      <header className="profile-detail-header">
        <div className="profile-detail-title-row">
          <h1>{profile.title}</h1>
          <Link to={`/profiles/${profileId}/candidates`}>
            <Button variant="glass">Upload Candidates →</Button>
          </Link>
        </div>
        <div className="profile-detail-meta text-dim">
          {profile.method_of_recruitment && <span>{profile.method_of_recruitment}</span>}
          {profile.pay_scale && <span>{profile.pay_scale}</span>}
          {(profile.base_age_min || profile.base_age_max) && (
            <span>
              Age {profile.base_age_min ?? "—"}–{profile.base_age_max ?? "—"}
            </span>
          )}
        </div>
      </header>

      {profile.age_relaxation_rules.length > 0 && (
        <section>
          <h2 className="section-title">Age relaxation rules</h2>
          <GlassCard className="relaxation-card">
            {profile.age_relaxation_rules.map((rule) => (
              <div key={rule.id} className="relaxation-row">
                <span>{rule.raw_category}</span>
                <span className="text-dim">
                  {rule.normalized_category} · +{rule.relaxation_text}
                </span>
              </div>
            ))}
          </GlassCard>
        </section>
      )}

      <section>
        <h2 className="section-title">Criteria ({profile.criteria.length})</h2>

        <div className="criteria-list">
          {profile.criteria.map((criterion) => (
            <CriterionRow key={criterion.id} profileId={profileId} criterion={criterion} />
          ))}
        </div>

        <AddCriterionForm profileId={profileId} />
      </section>
    </div>
  );
}

function CriterionRow({ profileId, criterion }) {
  const [isEditing, setIsEditing] = useState(false);
  const [type, setType] = useState(criterion.type);
  const [description, setDescription] = useState(criterion.description);
  const [isEssential, setIsEssential] = useState(criterion.is_essential);

  const updateCriterion = useUpdateCriterion(profileId);
  const deleteCriterion = useDeleteCriterion(profileId);

  function handleSave() {
    updateCriterion.mutate(
      { criterionId: criterion.id, payload: { type, description, is_essential: isEssential } },
      { onSuccess: () => setIsEditing(false) }
    );
  }

  function handleCancel() {
    setType(criterion.type);
    setDescription(criterion.description);
    setIsEssential(criterion.is_essential);
    setIsEditing(false);
  }

  function handleDelete() {
    if (window.confirm("Delete this criterion? This can't be undone.")) {
      deleteCriterion.mutate(criterion.id);
    }
  }

  if (isEditing) {
    return (
      <GlassCard className="criterion-row criterion-row-editing">
        <div className="criterion-edit-fields">
          <Input as="select" label="Type" value={type} onChange={(e) => setType(e.target.value)}>
            {CRITERION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Input>
          <Input
            as="select"
            label="Essential?"
            value={isEssential ? "true" : "false"}
            onChange={(e) => setIsEssential(e.target.value === "true")}
          >
            <option value="true">Essential</option>
            <option value="false">Desirable</option>
          </Input>
        </div>
        <Input
          as="textarea"
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {updateCriterion.isError && (
          <p className="upload-error">{updateCriterion.error.detail || updateCriterion.error.message}</p>
        )}
        <div className="criterion-actions">
          <Button variant="primary" onClick={handleSave} disabled={updateCriterion.isPending}>
            {updateCriterion.isPending ? "Saving…" : "Save"}
          </Button>
          <Button variant="ghost" onClick={handleCancel} disabled={updateCriterion.isPending}>
            Cancel
          </Button>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="criterion-row">
      <div className="criterion-row-main">
        <div className="criterion-tags">
          <span className="criterion-type">{criterion.type}</span>
          <span className={`criterion-essential ${criterion.is_essential ? "essential" : "desirable"}`}>
            {criterion.is_essential ? "Essential" : "Desirable"}
          </span>
        </div>
        <p className="criterion-description">{criterion.description}</p>
      </div>
      <div className="criterion-actions">
        <Button variant="ghost" onClick={() => setIsEditing(true)}>
          Edit
        </Button>
        <Button variant="ghost" onClick={handleDelete} disabled={deleteCriterion.isPending}>
          Delete
        </Button>
      </div>
    </GlassCard>
  );
}

function AddCriterionForm({ profileId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState("other");
  const [description, setDescription] = useState("");
  const [isEssential, setIsEssential] = useState(true);

  const addCriterion = useAddCriterion(profileId);

  function handleSubmit(e) {
    e.preventDefault();
    addCriterion.mutate(
      { type, description, is_essential: isEssential },
      {
        onSuccess: () => {
          setDescription("");
          setType("other");
          setIsEssential(true);
          setIsOpen(false);
        },
      }
    );
  }

  if (!isOpen) {
    return (
      <Button variant="glass" onClick={() => setIsOpen(true)} className="add-criterion-trigger">
        + Add criterion
      </Button>
    );
  }

  return (
    <GlassCard className="criterion-row criterion-row-editing" as="form" onSubmit={handleSubmit}>
      <div className="criterion-edit-fields">
        <Input as="select" label="Type" value={type} onChange={(e) => setType(e.target.value)}>
          {CRITERION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Input>
        <Input
          as="select"
          label="Essential?"
          value={isEssential ? "true" : "false"}
          onChange={(e) => setIsEssential(e.target.value === "true")}
        >
          <option value="true">Essential</option>
          <option value="false">Desirable</option>
        </Input>
      </div>
      <Input
        as="textarea"
        label="Description"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. Bachelor's degree in Engineering from a recognized university"
        required
      />
      {addCriterion.isError && (
        <p className="upload-error">{addCriterion.error.detail || addCriterion.error.message}</p>
      )}
      <div className="criterion-actions">
        <Button type="submit" variant="primary" disabled={addCriterion.isPending}>
          {addCriterion.isPending ? "Adding…" : "Add criterion"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
          Cancel
        </Button>
      </div>
    </GlassCard>
  );
}
