module.exports = function(grunt) {

  grunt.initConfig({
    clean: ["dist"],
    env : {
            invoke : {
                bucketMapping: '{"a":"bucket1", "b":"bucket2"}',
                userList: '{"testUser":"testPassword"}',
                maxSizeInBytes: 1000
            }
        },
    simplemocha: {
      options: {
        globals: ['expect'],
        timeout: 3000,
        ignoreLeaks: false,
        bail: false,
        slow: 1000,
        fullTrace: true,
        ui: 'bdd',
        reporter: 'mocha-circleci-reporter'
      },
      all: {src: ['test/src/*.js']}
    },
    lambda_invoke: {
        default: {
            options: {
                file_name: "src/index.js",
                event: "test/event/s3-basic-auth-event.json",
                client_context: "test/event/s3-basic-auth-client-context.json",
                identity: "test/event/s3-basic-auth-identity.json"
            }
        }
    },
    lambda_package: {
        default: {
            options: {
                // Task-specific options go here.
            }
        }
    },
    lambda_deploy: {
      default: {
        arn: 'arn:aws:lambda:us-east-1:821868433520:function:buckler-s3-proxy',
        options: {
          timeout: 30,
          memory: 128
        }
      }
    },
    jshint: {
      files: ['*.js', 'test/**/*.js'],
      options: {
        globals: {
          jQuery: true
        }
      }
    },
    watch: {
      files: ['<%= jshint.files %>'],
      tasks: ['jshint']
    }
  });

  // Always drop a stack trace on failure
  grunt.option('stack', true);

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-aws-lambda');
  grunt.loadNpmTasks('grunt-simple-mocha');
  grunt.loadNpmTasks('grunt-env');

  // SimpleMocha tests the services, lambda_invoke tests the lambda function
  grunt.registerTask('default', ['env:invoke','clean','lambda_package','jshint','simplemocha','lambda_invoke:png','lambda_invoke']);
  grunt.registerTask('ldeploy', ['clean','lambda_package', 'lambda_deploy:default']);
  grunt.registerTask('ldeploy-prod', ['clean','lambda_package', 'lambda_deploy:production']);

};
