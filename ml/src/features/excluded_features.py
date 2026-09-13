"""
Documented rationale for every field excluded from the PULSE feature
matrix. The authoritative list lives in configs/training.yaml
(`excluded_features`) and is enforced programmatically by
`validation.data_quality.assert_no_leakage`. This file exists so the
*reasoning* behind each exclusion is reviewable in one place, per spec
section 21 ("Maintain an explicit excluded-feature list... document why
each excluded field was excluded").
"""

EXCLUSION_RATIONALE = {
    "churn_date": (
        "Post-outcome field - only exists once the customer has already "
        "churned. Directly determines the label; including it would make "
        "the model trivially perfect and useless at real inference time, "
        "when a still-active customer's churn_date is unknown by definition."
    ),
    "customer_status": (
        "Directly encodes whether the customer has already churned. Same "
        "leakage issue as churn_date - this value would not be known for "
        "the population PULSE actually needs to score (currently active "
        "customers)."
    ),
    "days_to_churn": (
        "Derived from churn_date; carries the same leakage as churn_date "
        "even though it's numeric rather than a status flag."
    ),
    "churned_within_window": (
        "This is the prediction target itself, not a feature."
    ),
    "customer_id": (
        "A unique identifier carries no generalizable signal and risks the "
        "model memorizing individual customers rather than learning "
        "transferable behavioral patterns. Kept only as a join key, never "
        "passed to the model."
    ),
    "name": (
        "Company name is a free-text identifier with no causal relationship "
        "to churn; including it invites the model to pick up on spurious "
        "correlations from name composition (e.g. word length) or, worse, "
        "act as a proxy identifier."
    ),
    "signup_date": (
        "A raw calendar date doesn't generalize (a model trained on 2026 "
        "signup dates would not transfer to 2027 data). The generalizable "
        "signal - how long the customer has been on the platform - is "
        "already captured properly as tenure_days_at_snapshot, which is a "
        "duration, not a date."
    ),
    "snapshot_date": (
        "Metadata describing when the observation was taken, not a "
        "property of the customer. Like signup_date, a raw calendar date "
        "would not generalize to future scoring runs."
    ),
}


def describe(field: str) -> str:
    return EXCLUSION_RATIONALE.get(field, "No documented rationale on file - flag for review.")


if __name__ == "__main__":
    for field, reason in EXCLUSION_RATIONALE.items():
        print(f"- {field}: {reason}\n")
