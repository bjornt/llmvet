package main

import (
	"os"
	"testing"
)

func TestEnvDefault_EnvSet(t *testing.T) {
	t.Setenv("LLMVET_TEST_KEY", "from-env")
	got := envDefault("LLMVET_TEST_KEY", "fallback")
	if got != "from-env" {
		t.Errorf("envDefault with env set = %q, want %q", got, "from-env")
	}
}

func TestEnvDefault_EnvUnset(t *testing.T) {
	os.Unsetenv("LLMVET_TEST_KEY_MISSING")
	got := envDefault("LLMVET_TEST_KEY_MISSING", "fallback")
	if got != "fallback" {
		t.Errorf("envDefault with env unset = %q, want %q", got, "fallback")
	}
}

func TestEnvDefault_EnvEmptyStringUsesFallback(t *testing.T) {
	t.Setenv("LLMVET_TEST_KEY", "")
	got := envDefault("LLMVET_TEST_KEY", "fallback")
	if got != "fallback" {
		t.Errorf("envDefault with env empty = %q, want %q", got, "fallback")
	}
}

func TestEnvDefault_HostScenario(t *testing.T) {
	t.Setenv("LLMVET_HOST", "10.0.0.5")
	got := envDefault("LLMVET_HOST", "127.0.0.1")
	if got != "10.0.0.5" {
		t.Errorf("envDefault(LLMVET_HOST) = %q, want %q", got, "10.0.0.5")
	}
}

func TestEnvDefault_HostScenario_Unset(t *testing.T) {
	os.Unsetenv("LLMVET_HOST")
	got := envDefault("LLMVET_HOST", "127.0.0.1")
	if got != "127.0.0.1" {
		t.Errorf("envDefault(LLMVET_HOST) unset = %q, want %q", got, "127.0.0.1")
	}
}
